import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { google } from "googleapis";
import { db } from "#/db/index";
import { account } from "#/db/schema";
import { createTRPCRouter, protectedProcedure } from "../init";

async function getAuthedDrive(userId: string) {
  const [googleAccount] = await db
    .select()
    .from(account)
    .where(eq(account.userId, userId))
    .limit(1);

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

  // Persist refreshed tokens back to DB
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

export const driveRouter = createTRPCRouter({
  listFiles: protectedProcedure.query(async ({ ctx }) => {
    const drive = await getAuthedDrive(ctx.session.user.id);

    const res = await drive.files.list({
      pageSize: 100,
      fields: "files(id,name,mimeType,modifiedTime)",
      orderBy: "folder,name",
      // q: "'root' in parents and trashed = false and (mimeType = 'application/vnd.google-apps.folder' or mimeType contains 'image/')",
      q: "trashed = false and (mimeType contains 'image/')",
    });

    return res.data.files ?? [];
  }),
});
