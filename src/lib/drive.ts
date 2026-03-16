import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { type drive_v3, google } from "googleapis";
import { db } from "#/db/index";
import { account } from "#/db/schema";
import { parseDateTimeFromName, throttle } from "#/lib/utils";

export async function getAuthedDrive(userId: string) {
  const googleAccount = await db
    .select()
    .from(account)
    .where(eq(account.userId, userId))
    .limit(1)
    .get();

  if (!googleAccount?.accessToken) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No Google access token found. Please sign in again.",
    });
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  oauth2.setCredentials({
    access_token: googleAccount.accessToken,
    refresh_token: googleAccount.refreshToken ?? undefined,
    expiry_date: googleAccount.accessTokenExpiresAt?.getTime() ?? undefined,
  });

  oauth2.on("tokens", async (tokens) => {
    await db
      .update(account)
      .set({
        accessToken: tokens.access_token ?? googleAccount.accessToken,
        ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
        ...(tokens.expiry_date && {
          accessTokenExpiresAt: new Date(tokens.expiry_date),
        }),
      })
      .where(eq(account.id, googleAccount.id));
  });

  return google.drive({ version: "v3", auth: oauth2 });
}

/** Scans a folder's media files to find the earliest creation time from EXIF or filename.
 * If no time is found, recursively searches subfolders in parallel.
 * Returns null if no valid creation time is found. Respects the maxDurationMs timeout. */
export async function fetchFolderCreationTimeValue(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  maxDurationMs: number = 5000,
): Promise<Date | null> {
  const startTime = Date.now();
  const MAX_DURATION_MS = maxDurationMs;

  // Throttled wrapper for drive.files.list (100 calls per second)
  const throttledList = throttle(
    async (params: drive_v3.Params$Resource$Files$List) =>
      drive.files.list(params),
    100,
  );

  async function searchFolder(currentFolderId: string): Promise<Date | null> {
    // Check timeout
    if (Date.now() - startTime > MAX_DURATION_MS) {
      return null;
    }

    let pageToken: string | undefined;
    let earliestTakenTime: Date | null = null;

    // Scan files in current folder
    do {
      if (Date.now() - startTime > MAX_DURATION_MS) {
        break;
      }

      const res = await throttledList({
        fields: "nextPageToken,files(name,imageMediaMetadata(time))",
        pageSize: 1000,
        pageToken,
        q: `'${currentFolderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
      });

      const files = res.data.files ?? [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let candidateTime: Date | null = null;

        // Try EXIF time first
        const timeRaw = file.imageMediaMetadata?.time;
        if (timeRaw) {
          const parsed = new Date(timeRaw);
          if (!Number.isNaN(parsed.getTime())) {
            candidateTime = parsed;
          }
        }

        // If no EXIF time, try parsing filename
        if (!candidateTime && file.name) {
          candidateTime = parseDateTimeFromName(file.name);
        }

        // Update earliest time if this candidate is earlier
        if (
          candidateTime &&
          (!earliestTakenTime || candidateTime < earliestTakenTime)
        ) {
          earliestTakenTime = candidateTime;
        }
      }

      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    // If we found a time in this folder, return it
    if (earliestTakenTime) {
      return earliestTakenTime;
    }

    // If not, search subfolders
    if (Date.now() - startTime > MAX_DURATION_MS) {
      return null;
    }

    let folderPageToken: string | undefined;
    do {
      if (Date.now() - startTime > MAX_DURATION_MS) {
        break;
      }

      const folderRes = await throttledList({
        fields: "nextPageToken,files(id,mimeType)",
        pageSize: 1000,
        pageToken: folderPageToken,
        q: `'${currentFolderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
      });

      const subfolders = folderRes.data.files ?? [];

      // Search subfolders in parallel
      const subfoldersResults = await Promise.all(
        subfolders
          .filter((subfolder) => subfolder.id)
          .map((subfolder) => searchFolder(subfolder.id!)),
      );

      for (let i = 0; i < subfoldersResults.length; i++) {
        const subfolderTime = subfoldersResults[i];
        if (
          subfolderTime &&
          (!earliestTakenTime || subfolderTime < earliestTakenTime)
        ) {
          earliestTakenTime = subfolderTime;
        }
      }

      folderPageToken = folderRes.data.nextPageToken ?? undefined;
    } while (folderPageToken);

    if (earliestTakenTime) {
      return earliestTakenTime;
    }

    if (Date.now() - startTime > MAX_DURATION_MS) {
      return null;
    }

    // Fallback for this folder: if no media/subfolder-derived time exists,
    // use the first created direct child item's createdTime.
    const fallbackRes = await throttledList({
      fields: "files(createdTime)",
      orderBy: "createdTime",
      pageSize: 1,
      q: `'${currentFolderId}' in parents and trashed = false`,
    });

    const firstCreatedTime = fallbackRes.data.files?.[0]?.createdTime;
    if (!firstCreatedTime) {
      return null;
    }

    const parsedFallback = new Date(firstCreatedTime);
    if (Number.isNaN(parsedFallback.getTime())) {
      return null;
    }

    return parsedFallback;
  }

  return searchFolder(folderId);
}
