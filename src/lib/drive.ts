import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { type drive_v3, google } from "googleapis";
import { db } from "#/db/index";
import { account, imageOriginalVersion } from "#/db/schema";
import { resolveMediaDateTime, throttle } from "#/lib/utils";

export type FetchFolderCreationTimeResult = {
  creation_time: Date | null;
  fetchedFolders: Record<string, Date>;
};

/** Builds an authenticated Google OAuth2 client for the given user,
 * persisting refreshed tokens back to the database. */
async function buildOAuth2Client(userId: string) {
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
    refresh_token: googleAccount.refreshToken,
    expiry_date: googleAccount.accessTokenExpiresAt?.getTime(),
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

  return oauth2;
}

export async function getAuthedDrive(userId: string) {
  const oauth2 = await buildOAuth2Client(userId);
  return google.drive({ version: "v3", auth: oauth2 });
}

/** Initiates a Google Drive resumable upload session and returns the session URI.
 * Pass `existingId` to overwrite an existing file (uses PATCH), otherwise a new file is created.
 * The returned URI is used by the client to PUT the file bytes directly to Google Drive. */
export async function initResumableUpload({
  userId,
  fileName,
  mimeType,
  parent,
  fileSize,
  existingId,
}: {
  userId: string;
  fileName: string;
  mimeType: string;
  parent: string;
  fileSize?: number;
  existingId?: string | null;
}): Promise<string> {
  const oauth2 = await buildOAuth2Client(userId);
  const drive = google.drive({ version: "v3", auth: oauth2 });

  // Prefer currently stored access token to avoid forcing a refresh
  // (which can fail with invalid_grant for stale/revoked refresh tokens).
  let accessToken = oauth2.credentials.access_token ?? undefined;
  if (!accessToken) {
    try {
      const tokenResult = await oauth2.getAccessToken();
      accessToken = tokenResult.token ?? undefined;
    } catch {
      throw new Error(
        "No Google access token available. Please sign in again.",
      );
    }
  }

  if (!accessToken) {
    throw new Error("No Google access token available. Please sign in again.");
  }

  let matchedExistingId = existingId ?? null;
  if (!matchedExistingId) {
    const existing = await drive.files.list({
      q: `'${parent}' in parents and name = '${fileName.replace(/'/g, "\\'")}' and trashed = false`,
      fields: "files(id)",
      pageSize: 1,
    });
    matchedExistingId = existing.data.files?.[0]?.id ?? null;
  }

  // When replacing an existing file, clear the cached original-version row.
  if (matchedExistingId) {
    await db
      .delete(imageOriginalVersion)
      .where(eq(imageOriginalVersion.fileId, matchedExistingId));
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "X-Upload-Content-Type": mimeType,
  };
  if (fileSize !== undefined) {
    headers["X-Upload-Content-Length"] = String(fileSize);
  }

  const url = matchedExistingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${matchedExistingId}?uploadType=resumable`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
  const body = matchedExistingId ? {} : { name: fileName, parents: [parent] };

  const resp = await fetch(url, {
    method: matchedExistingId ? "PATCH" : "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(
      `Failed to initiate Google Drive upload session: ${errText}`,
    );
  }

  const location = resp.headers.get("Location");
  if (!location) {
    throw new Error("No resumable upload URI returned by Google Drive.");
  }

  return location;
}

/** Scans a folder's media files to find the earliest creation time from EXIF or filename.
 * If no time is found, recursively searches subfolders in parallel.
 * Returns creation_time and a fetchedFolders map (including the requested folder).
 * Respects the maxDurationMs timeout. */
export async function fetchFolderCreationTimeValue(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  maxDurationMs: number = 5000,
): Promise<FetchFolderCreationTimeResult> {
  const startTime = Date.now();
  const MAX_DURATION_MS = maxDurationMs;
  const fetchedFolders: Record<string, Date> = {};

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
        fields:
          "nextPageToken,files(name,createdTime,modifiedTime,imageMediaMetadata(time))",
        pageSize: 1000,
        pageToken,
        q: `'${currentFolderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
      });

      const files = res.data.files ?? [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const candidateTime = resolveMediaDateTime({
          metadataTime: file.imageMediaMetadata?.time,
          fileName: file.name,
          createdTime: file.createdTime,
          modifiedTime: file.modifiedTime,
        });

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
      fetchedFolders[currentFolderId] = earliestTakenTime;
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
      fetchedFolders[currentFolderId] = earliestTakenTime;
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

    fetchedFolders[currentFolderId] = parsedFallback;
    return parsedFallback;
  }

  const creation_time = await searchFolder(folderId);
  return { creation_time, fetchedFolders };
}
