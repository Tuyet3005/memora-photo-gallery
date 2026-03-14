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
      const path: { id: string; name: string; canEdit: boolean }[] = [];
      let currentId = input.folderId;

      for (let i = 0; i < 20; i++) {
        const res = await drive.files.get({
          fileId: currentId,
          fields: "id,name,parents,owners(emailAddress),capabilities(canEdit)",
        });
        const file = res.data;
        if (!file.id || !file.name) break;

        const parentId = file.parents?.[0];

        // Exclude My Drive (no parent & owned by current user)
        if (
          !parentId &&
          file.owners?.[0]?.emailAddress === ctx.session.user.email
        ) {
          break;
        }

        path.unshift({
          id: file.id,
          name: file.name,
          canEdit: file.capabilities?.canEdit ?? false,
        });

        if (!parentId) break;
        currentId = parentId;
      }

      return path;
    }),

  listFolders: protectedProcedure
    .input(z.object({ folderId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const drive = await getAuthedDrive(ctx.session.user.id);
      const parent = input.folderId ?? "root";

      const res = await drive.files.list({
        fields:
          "files(id,name,mimeType,capabilities(canEdit),shortcutDetails(targetId,targetMimeType))",
        orderBy: "name",
        q: `'${parent}' in parents and trashed = false and (mimeType = 'application/vnd.google-apps.folder' or (mimeType = 'application/vnd.google-apps.shortcut' and shortcutDetails.targetMimeType = 'application/vnd.google-apps.folder'))`,
      });

      const files = res.data.files ?? [];
      const normalizedFolders = files
        .map((f) => {
          const isShortcut =
            f.mimeType === "application/vnd.google-apps.shortcut";
          const effectiveId = isShortcut
            ? (f.shortcutDetails?.targetId ?? null)
            : (f.id ?? null);

          if (!effectiveId) return null;

          return {
            ...f,
            id: effectiveId,
            shortcutId: isShortcut ? (f.id ?? null) : null,
            isShortcut,
          };
        })
        .filter((f) => f !== null);

      const folderIds = normalizedFolders.map((f) => f.id);

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

      return normalizedFolders.map((f) => ({
        ...f,
        canEdit: f.capabilities?.canEdit ?? false,
        thumbnail: f.id ? (thumbnailMap[f.id] ?? null) : null,
      }));
    }),

  setFolderThumbnail: protectedProcedure
    .input(
      z.object({
        folderId: z.string(),
        fileId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const drive = await getAuthedDrive(ctx.session.user.id);
      const folderRes = await drive.files.get({
        fileId: input.folderId,
        fields: "capabilities(canEdit)",
      });
      if (!folderRes.data.capabilities?.canEdit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have edit permission for this folder",
        });
      }
      const now = new Date();
      await db
        .insert(folderThumbnail)
        .values({
          folderId: input.folderId,
          fileId: input.fileId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: folderThumbnail.folderId,
          set: {
            fileId: input.fileId,
            updatedAt: now,
          },
        });
    }),

  getFolderThumbnails: protectedProcedure
    .input(z.object({ fileIds: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      if (input.fileIds.length === 0) return {};
      const drive = await getAuthedDrive(ctx.session.user.id);
      const results = await Promise.all(
        input.fileIds.map(async (fileId) => {
          const res = await drive.files.get({
            fileId,
            fields: "id,thumbnailLink",
          });
          return { fileId, thumbnailLink: res.data.thumbnailLink ?? null };
        }),
      );
      return Object.fromEntries(
        results.map(({ fileId, thumbnailLink }) => [fileId, thumbnailLink]),
      );
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
        fields:
          "nextPageToken,files(id,name,mimeType,thumbnailLink,createdTime,modifiedTime)",
        orderBy: "name",
        q: `'${parent}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
      });

      return {
        files: res.data.files ?? [],
        nextCursor: res.data.nextPageToken ?? null,
      };
    }),

  createFolder: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        parentFolderId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const drive = await getAuthedDrive(ctx.session.user.id);
      const res = await drive.files.create({
        requestBody: {
          name: input.name,
          mimeType: "application/vnd.google-apps.folder",
          parents: input.parentFolderId ? [input.parentFolderId] : undefined,
        },
        fields: "id,name",
      });
      return { id: res.data.id!, name: res.data.name! };
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
