import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { google } from "googleapis";
import { db } from "#/db/index";
import { account } from "#/db/schema";
import { parseDateTimeFromName } from "#/lib/utils";

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
 * Returns null if no valid creation time is found. */
export async function fetchFolderCreationTimeValue(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
): Promise<Date | null> {
  let pageToken: string | undefined;
  let earliestTakenTime: Date | null = null;

  do {
    const res = await drive.files.list({
      fields: "nextPageToken,files(name,imageMediaMetadata(time))",
      pageSize: 1000,
      pageToken,
      q: `'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
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

  return earliestTakenTime;
}
