import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import {
  folderMetadata,
  signedUpload,
  uploadDelegation,
  user,
} from "#/db/schema";
import { fetchFolderCreationTimeValue, getAuthedDrive } from "#/lib/drive";
import { createTRPCRouter, protectedProcedure } from "../init";

export const driveRouter = createTRPCRouter({
  /** Walks up the Drive hierarchy from the given folder and returns the full
   * ancestor path as an ordered array (nearest-root first), stopping before
   * the user's My Drive root. */
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

  /** Lists all child folders (and folder shortcuts) of the given parent,
   * enriched with custom thumbnail metadata stored in the database. */
  listFolders: protectedProcedure
    .input(z.object({ folderId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const drive = await getAuthedDrive(ctx.session.user.id);
      const parent = input.folderId ?? "root";

      const res = await drive.files.list({
        fields:
          "files(id,name,mimeType,createdTime,capabilities(canEdit),shortcutDetails(targetId,targetMimeType))",
        orderBy: "createdTime desc,name",
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
              .from(folderMetadata)
              .where(inArray(folderMetadata.folderId, folderIds))
          : [];

      const thumbnailMap = Object.fromEntries(
        thumbnails.map((t) => [t.folderId, t]),
      );

      return normalizedFolders.map((f) => ({
        ...f,
        canEdit: f.capabilities?.canEdit ?? false,
        metadata: f.id ? (thumbnailMap[f.id] ?? null) : null,
      }));
    }),

  /** Persists a custom thumbnail file ID for a folder in the database.
   * Requires edit permission on the folder in Drive. */
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
        .insert(folderMetadata)
        .values({
          folderId: input.folderId,
          thumbnailFileId: input.fileId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: folderMetadata.folderId,
          set: {
            thumbnailFileId: input.fileId,
            updatedAt: now,
          },
        });
    }),

  /** Fetches fresh Drive thumbnail links for a batch of file IDs.
   * Returns a map of fileId → thumbnailLink; failed items are omitted. */
  getFolderThumbnails: protectedProcedure
    .input(z.object({ fileIds: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      if (input.fileIds.length === 0) return {};
      const drive = await getAuthedDrive(ctx.session.user.id);
      const results = await Promise.allSettled(
        input.fileIds.map(async (fileId) => {
          const res = await drive.files.get({
            fileId,
            fields: "id,thumbnailLink",
          });
          return { fileId, thumbnailLink: res.data.thumbnailLink ?? null };
        }),
      );
      return Object.fromEntries(
        results
          .map((result) => {
            if (result.status === "fulfilled") {
              return [result.value.fileId, result.value.thumbnailLink];
            } else {
              return null;
            }
          })
          .filter(Boolean) as [string, string][],
      );
    }),

  /** Fetches each folder's creation time by scanning its media files (EXIF or
   * filename), stores it in folder metadata, and returns a map of
   * folderId → creationTime. Returns null if none is found. */
  fetchFolderCreationTime: protectedProcedure
    .input(z.object({ folderIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const uniqueFolderIds = Array.from(new Set(input.folderIds)).filter(
        (id) => id.length > 0,
      );
      if (uniqueFolderIds.length === 0) {
        return {} as Record<string, Date | null>;
      }

      const drive = await getAuthedDrive(ctx.session.user.id);
      const createdTimes = await Promise.all(
        uniqueFolderIds.map(async (folderId) => {
          try {
            const creationTime = await fetchFolderCreationTimeValue(
              drive,
              folderId,
            );
            return { folderId, creationTime };
          } catch (_e) {
            return { folderId, creationTime: null as Date | null };
          }
        }),
      );

      if (createdTimes.length > 0) {
        const now = new Date();
        await db.transaction(async (tx) => {
          await tx
            .insert(folderMetadata)
            .values(
              createdTimes.map((row) => ({
                folderId: row.folderId,
                thumbnailFileId: null,
                creationTime: row.creationTime,
                createdAt: now,
                updatedAt: now,
              })),
            )
            .onConflictDoNothing({ target: folderMetadata.folderId });

          await Promise.all(
            createdTimes.map((row) =>
              tx
                .update(folderMetadata)
                .set({ creationTime: row.creationTime, updatedAt: now })
                .where(eq(folderMetadata.folderId, row.folderId)),
            ),
          );
        });
      }

      return Object.fromEntries(
        createdTimes.map((row) => [row.folderId, row.creationTime]),
      ) as Record<string, Date | null>;
    }),

  /** Paginates images and videos inside the given folder (or Drive root),
   * ordered by name. Supports cursor-based pagination via page tokens. */
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
          "nextPageToken,files(id,name,mimeType,thumbnailLink,createdTime,modifiedTime,imageMediaMetadata(time))",
        orderBy: "name",
        q: `'${parent}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
      });

      const files = (res.data.files ?? []).map((file) => ({
        ...file,
        createdTime: file.imageMediaMetadata?.time ?? file.createdTime ?? null,
      }));

      return {
        files,
        nextCursor: res.data.nextPageToken ?? null,
      };
    }),

  /** Creates a new Google Drive folder, optionally nested inside a parent. */
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

  /** Renames a Drive folder. Requires edit permission; the "Memora" root
   * folder is protected and cannot be renamed. */
  renameFolder: protectedProcedure
    .input(
      z.object({
        folderId: z.string(),
        name: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const drive = await getAuthedDrive(ctx.session.user.id);

      const folderRes = await drive.files.get({
        fileId: input.folderId,
        fields: "id,name,capabilities(canEdit)",
      });

      if (!folderRes.data.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Folder not found",
        });
      }

      if (!folderRes.data.capabilities?.canEdit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have edit permission for this folder",
        });
      }

      if (folderRes.data.name === "Memora") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Memora folder cannot be renamed",
        });
      }

      const updated = await drive.files.update({
        fileId: input.folderId,
        requestBody: { name: input.name },
        fields: "id,name",
      });

      return {
        id: updated.data.id ?? input.folderId,
        name: updated.data.name ?? input.name,
      };
    }),

  /** Issues a short-lived signed upload token inserted into the database.
   * When a delegation ID is supplied, the upload is attributed to the grantor
   * and the target folder is shared with them so they can access the file. */
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
