import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import type { drive_v3 } from "googleapis";
import { Jimp } from "jimp";
import { z } from "zod";
import { db } from "#/db/index";
import { imageOriginalVersion } from "#/db/schema";
import { getAuthedDrive } from "#/lib/drive";
import { createTRPCRouter, protectedProcedure } from "../init";

async function rotateBuffer(
  buffer: Buffer,
  degrees: number,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const image = await Jimp.fromBuffer(buffer);
  const mimeType = image.mime ?? "image/jpeg";
  image.rotate(degrees);
  const rotated = await image.getBuffer(
    mimeType as Parameters<typeof image.getBuffer>[0],
  );
  return { buffer: rotated, mimeType };
}

async function uploadBuffer(
  drive: drive_v3.Drive,
  fileId: string,
  mimeType: string,
  buffer: Buffer,
): Promise<void> {
  await drive.files.update({
    fileId,
    media: { mimeType, body: Readable.from(buffer) },
  });
}

export const mediaEditRouter = createTRPCRouter({
  /** Rotates an image in Google Drive by a multiple of 90° counter-clockwise.
   * On the first rotation the original Drive revision is saved so that all
   * subsequent rotations always transform the pristine original bytes — avoiding
   * repeated re-encoding artefacts. Rotating back to 0° restores the original
   * file content without re-encoding. */
  rotateImage: protectedProcedure
    .input(
      z.object({
        fileId: z.string(),
        // degrees to rotate counter-clockwise (always 90 for "rotate left")
        degrees: z.number().int().multipleOf(90).default(90),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const drive = await getAuthedDrive(ctx.session.user.id);

      const existing = await db.query.imageOriginalVersion.findFirst({
        where: eq(imageOriginalVersion.fileId, input.fileId),
      });

      const newRotationDeg =
        ((existing?.rotationDeg ?? 0) + input.degrees) % 360;
      const now = new Date();
      let revision = existing?.revisionId;

      const [_, originalRes] = await Promise.all([
        // Fetch revision if not already known
        revision == null &&
          drive.revisions
            .list({
              fileId: input.fileId,
              fields: "revisions(id)",
            })
            .then((res) => {
              const revisions = res.data.revisions ?? [];
              revision = revisions[revisions.length - 1]?.id ?? undefined;
            }),
        // Fetch file or revision depending on whether we already have the original revision ID
        revision == null
          ? drive.files.get(
              { fileId: input.fileId, alt: "media" },
              { responseType: "arraybuffer" },
            )
          : drive.revisions.get(
              {
                fileId: input.fileId,
                revisionId: revision,
                alt: "media",
              },
              { responseType: "arraybuffer" },
            ),
      ]);
      const originalBuffer = Buffer.from(originalRes.data as ArrayBuffer);

      if (newRotationDeg === 0) {
        // Back to original — restore original bytes without re-encoding
        const image = await Jimp.fromBuffer(originalBuffer);
        const mimeType = image.mime ?? "image/jpeg";
        await uploadBuffer(drive, input.fileId, mimeType, originalBuffer);
      } else {
        const { buffer: rotatedBuffer, mimeType } = await rotateBuffer(
          originalBuffer,
          newRotationDeg,
        );
        await uploadBuffer(drive, input.fileId, mimeType, rotatedBuffer);
      }
      if (existing) {
        await db
          .update(imageOriginalVersion)
          .set({ rotationDeg: newRotationDeg, updatedAt: now })
          .where(eq(imageOriginalVersion.fileId, input.fileId));
      } else {
        await db.insert(imageOriginalVersion).values({
          fileId: input.fileId,
          revisionId: revision ?? "",
          rotationDeg: newRotationDeg,
          createdAt: now,
          updatedAt: now,
        });
      }

      return { success: true };
    }),
});
