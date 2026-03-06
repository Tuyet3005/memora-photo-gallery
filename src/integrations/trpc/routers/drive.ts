import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { google } from "googleapis";
import { db } from "#/db/index";
import { account, imageThumbnailCache } from "#/db/schema";
import { createTRPCRouter, protectedProcedure } from "../init";

export const driveRouter = createTRPCRouter({
  listFiles: protectedProcedure.query(async ({ ctx }) => {
    const [googleAccount] = await db
      .select()
      .from(account)
      .where(eq(account.userId, ctx.session.user.id))
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
    oauth2.setCredentials({ access_token: googleAccount.accessToken });

    const drive = google.drive({ version: "v3", auth: oauth2 });

    const res = await drive.files.list({
      pageSize: 100,
      fields: "files(id,name,mimeType,modifiedTime,size,thumbnailLink)",
      orderBy: "folder,name",
      // q: "'root' in parents and trashed = false and (mimeType = 'application/vnd.google-apps.folder' or mimeType contains 'image/')",
      q: "trashed = false and (mimeType contains 'image/')",
    });

    const files = res.data.files ?? [];

    const imageIds = files
      .filter(
        (f) => f.mimeType !== "application/vnd.google-apps.folder" && f.id,
      )
      .map((f) => f.id as string);

    const thumbnails =
      imageIds.length > 0
        ? await db
            .select()
            .from(imageThumbnailCache)
            .where(inArray(imageThumbnailCache.fileId, imageIds))
        : [];

    const thumbnailMap = new Map(thumbnails.map((t) => [t.fileId, t.base64]));

    const thumbnailLinkMap = new Map(
      files
        .filter((f) => f.id && f.thumbnailLink)
        .map((f) => [f.id as string, f.thumbnailLink as string]),
    );

    const uncachedIds = imageIds.filter(
      (id) => !thumbnailMap.has(id) && thumbnailLinkMap.has(id),
    );

    if (uncachedIds.length > 0) {
      const fetched = await Promise.allSettled(
        uncachedIds.map(async (id) => {
          const base = thumbnailLinkMap.get(id) as string;
          // Replace or append the size param to get w30
          const url = base
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

      const toInsert: { fileId: string; base64: string; generatedAt: Date }[] =
        [];
      for (const result of fetched) {
        if (result.status === "fulfilled") {
          thumbnailMap.set(result.value.id, result.value.base64);
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

    return files.map((f) => ({
      ...f,
      thumbnailBase64: f.id ? (thumbnailMap.get(f.id) ?? null) : null,
    }));
  }),
});
