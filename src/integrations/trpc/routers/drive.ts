import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { google } from "googleapis";
import { z } from "zod";
import { db } from "#/db/index";
import { account, imageThumbnailCache } from "#/db/schema";
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

  loadThumbnails: protectedProcedure
    .input(z.array(z.string()))
    .mutation(async ({ ctx, input: ids }) => {
      if (ids.length === 0) return [];

      const cached = await db
        .select()
        .from(imageThumbnailCache)
        .where(inArray(imageThumbnailCache.fileId, ids));

      const cachedMap = new Map(cached.map((t) => [t.fileId, t.base64]));

      const uncachedIds = ids.filter((id) => !cachedMap.has(id));

      if (uncachedIds.length > 0) {
        const googleAccount = await getGoogleAccount(ctx.session.user.id);

        const oauth2 = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
        );
        oauth2.setCredentials({ access_token: googleAccount.accessToken });
        const drive = google.drive({ version: "v3", auth: oauth2 });

        const fetched = await Promise.allSettled(
          uncachedIds.map(async (id) => {
            const fileRes = await drive.files.get({
              fileId: id,
              fields: "thumbnailLink",
            });
            const thumbnailLink = fileRes.data.thumbnailLink;
            if (!thumbnailLink) throw new Error(`No thumbnailLink for ${id}`);
            const url = thumbnailLink
              .replace(/=s\d+(-w\d+)?/, "=w15")
              .replace(/=w\d+/, "=w15");
            const response = await fetch(url, {
              headers: { Authorization: `Bearer ${googleAccount.accessToken}` },
            });
            if (!response.ok)
              throw new Error(`Failed to fetch thumbnail for ${id}`);
            const buffer = await response.arrayBuffer();
            const base64 = Buffer.from(buffer).toString("base64");
            const mime = response.headers.get("content-type") ?? "image/jpeg";
            return { id, base64: `data:${mime};base64,${base64}` };
          }),
        );

        const toInsert: {
          fileId: string;
          base64: string;
          generatedAt: Date;
        }[] = [];
        for (const result of fetched) {
          if (result.status === "fulfilled") {
            cachedMap.set(result.value.id, result.value.base64);
            toInsert.push({
              fileId: result.value.id,
              base64: result.value.base64,
              generatedAt: new Date(),
            });
          }
        }

        if (toInsert.length > 0) {
          await db
            .insert(imageThumbnailCache)
            .values(toInsert)
            .onConflictDoUpdate({
              target: imageThumbnailCache.fileId,
              set: {
                base64: imageThumbnailCache.base64,
                generatedAt: imageThumbnailCache.generatedAt,
              },
            });
        }
      }

      return ids.map((id) => ({ id, base64: cachedMap.get(id) ?? null }));
    }),
});
