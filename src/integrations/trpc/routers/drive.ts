import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import {
  folderThumbnail,
  signedUpload,
  uploadDelegation,
  user,
} from "#/db/schema";
import { getAuthedDrive } from "#/lib/drive";
import { createTRPCRouter, protectedProcedure } from "../init";

export const driveRouter = createTRPCRouter({
  getFolderPath: protectedProcedure
    .input(z.object({ folderId: z.string() }))
    .query(async ({ ctx, input }) => {
      const drive = await getAuthedDrive(ctx.session.user.id);
      const path: { id: string; name: string }[] = [];
      let currentId = input.folderId;

      for (let i = 0; i < 20; i++) {
        const res = await drive.files.get({
          fileId: currentId,
          fields: "id,name,parents",
        });
        const file = res.data;
        if (!file.id || !file.name) break;
        path.unshift({ id: file.id, name: file.name });
        const parentId = file.parents?.[0];
        if (!parentId) break;
        currentId = parentId;
      }

      return path.slice(1); // Remove root
    }),

  listFolders: protectedProcedure
    .input(z.object({ folderId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const drive = await getAuthedDrive(ctx.session.user.id);
      const parent = input.folderId ?? "root";

      const res = await drive.files.list({
        fields: "files(id,name,mimeType)",
        orderBy: "name",
        q: `'${parent}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
      });

      const files = res.data.files ?? [];
      const folderIds = files.map((f) => f.id).filter(Boolean) as string[];

      const thumbnails =
        folderIds.length > 0
          ? await db
              .select()
              .from(folderThumbnail)
              .where(inArray(folderThumbnail.folderId, folderIds))
          : [];

      const thumbnailMap = Object.fromEntries(
        thumbnails.map((t) => [t.folderId, t]),
      );

      return files.map((f) => ({
        ...f,
        thumbnail: f.id ? (thumbnailMap[f.id] ?? null) : null,
      }));
    }),

  setFolderThumbnail: protectedProcedure
    .input(
      z.object({
        folderId: z.string(),
        fileId: z.string(),
        thumbnailLink: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const now = new Date();
      await db
        .insert(folderThumbnail)
        .values({
          folderId: input.folderId,
          fileId: input.fileId,
          thumbnailLink: input.thumbnailLink,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: folderThumbnail.folderId,
          set: {
            fileId: input.fileId,
            thumbnailLink: input.thumbnailLink,
            updatedAt: now,
          },
        });
    }),

  listMedia: protectedProcedure
    .input(
      z.object({
        folderId: z.string().optional(),
        cursor: z.string().optional(),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const drive = await getAuthedDrive(ctx.session.user.id);
      const parent = input.folderId ?? "root";

      const res = await drive.files.list({
        pageSize: input.pageSize,
        pageToken: input.cursor,
        fields: "nextPageToken,files(id,name,mimeType,thumbnailLink)",
        orderBy: "name",
        q: `'${parent}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
      });

      return {
        files: res.data.files ?? [],
        nextCursor: res.data.nextPageToken ?? null,
      };
    }),

  generateUploadUrl: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        mimeType: z.string(),
        folderId: z.string().optional(),
        uploadDelegationId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.uploadDelegationId && !input.folderId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Delegation can only be used when uploading to a folder",
        });
      }

      let effectiveUserId = ctx.session.user.id;

      if (input.uploadDelegationId) {
        const delegation = await db
          .select({
            grantorId: uploadDelegation.grantorId,
            grantorEmail: user.email,
          })
          .from(uploadDelegation)
          .innerJoin(user, eq(user.id, uploadDelegation.grantorId))
          .where(
            and(
              eq(uploadDelegation.id, input.uploadDelegationId),
              eq(uploadDelegation.granteeId, ctx.session.user.id),
            ),
          )
          .limit(1)
          .get();

        if (!delegation) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Delegation not found or not authorized",
          });
        }

        effectiveUserId = delegation.grantorId;

        // Share the target folder with the grantee so they can access uploaded files.
        // Root cannot be shared via the API, so only share when a specific folder is set.
        if (input.folderId) {
          const drive = await getAuthedDrive(ctx.session.user.id);
          await drive.permissions.create({
            fileId: input.folderId,
            requestBody: {
              type: "user",
              role: "writer",
              emailAddress: delegation.grantorEmail,
            },
            sendNotificationEmail: false,
          });
        }
      }

      const id = crypto.randomUUID();
      const now = new Date();
      await db.insert(signedUpload).values({
        id,
        userId: effectiveUserId,
        folderId: input.folderId ?? null,
        fileName: input.fileName,
        mimeType: input.mimeType,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        createdAt: now,
      });
      return { uploadId: id };
    }),
});
