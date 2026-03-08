import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { folderShare } from "#/db/schema";
import { getAuthedDrive } from "#/lib/drive";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../init";

export const shareRouter = createTRPCRouter({
  createFolderShare: protectedProcedure
    .input(z.object({ folderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if a share already exists for this folder by this user
      const existing = await db
        .select()
        .from(folderShare)
        .where(eq(folderShare.folderId, input.folderId))
        .limit(1)
        .get();

      if (existing) {
        return { shareId: existing.id };
      }

      const id = crypto.randomUUID();
      await db.insert(folderShare).values({
        id,
        folderId: input.folderId,
        userId: ctx.session.user.id,
        createdAt: new Date(),
      });

      return { shareId: id };
    }),

  getShareInfo: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(async ({ input }) => {
      const share = await db
        .select()
        .from(folderShare)
        .where(eq(folderShare.id, input.shareId))
        .limit(1)
        .get();

      if (!share) {
        return null;
      }

      return { folderId: share.folderId, userId: share.userId };
    }),

  listSharedMedia: publicProcedure
    .input(
      z.object({
        shareId: z.string(),
        cursor: z.string().optional(),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const share = await db
        .select()
        .from(folderShare)
        .where(eq(folderShare.id, input.shareId))
        .limit(1)
        .get();

      if (!share) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Share not found" });
      }

      const drive = await getAuthedDrive(share.userId);

      const res = await drive.files.list({
        pageSize: input.pageSize,
        pageToken: input.cursor,
        fields: "nextPageToken,files(id,name,mimeType,thumbnailLink)",
        orderBy: "name",
        q: `'${share.folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
      });

      return {
        folderId: share.folderId,
        files: res.data.files ?? [],
        nextCursor: res.data.nextPageToken ?? null,
      };
    }),
});
