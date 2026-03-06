import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { google } from "googleapis";
import { z } from "zod";
import { db } from "#/db/index";
import { account, signedUpload } from "#/db/schema";
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
  listFiles: protectedProcedure
    .input(z.object({ folderId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const drive = await getAuthedDrive(ctx.session.user.id);
      const parent = input?.folderId ?? "root";

      const res = await drive.files.list({
        pageSize: 100,
        fields: "files(id,name,mimeType,modifiedTime)",
        orderBy: "folder,name",
        q: `'${parent}' in parents and trashed = false and (mimeType = 'application/vnd.google-apps.folder' or mimeType contains 'image/')`,
      });

      return res.data.files ?? [];
    }),

  generateUploadUrl: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        mimeType: z.string(),
        folderId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      const now = new Date();
      await db.insert(signedUpload).values({
        id,
        userId: ctx.session.user.id,
        folderId: input.folderId ?? null,
        fileName: input.fileName,
        mimeType: input.mimeType,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        createdAt: now,
      });
      return { uploadId: id };
    }),
});
