import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { google } from "googleapis";
import { db } from "#/db/index";
import { account } from "#/db/schema";
import { createTRPCRouter, protectedProcedure } from "../init";

async function getGoogleAccount(userId: string) {
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
  return googleAccount;
}

export const driveRouter = createTRPCRouter({
  listFiles: protectedProcedure.query(async ({ ctx }) => {
    const googleAccount = await getGoogleAccount(ctx.session.user.id);

    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    oauth2.setCredentials({ access_token: googleAccount.accessToken });

    const drive = google.drive({ version: "v3", auth: oauth2 });

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
