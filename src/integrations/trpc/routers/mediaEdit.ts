import { Readable } from "node:stream";
import { Jimp } from "jimp";
import { z } from "zod";
import { getAuthedDrive } from "#/lib/drive";
import { createTRPCRouter, protectedProcedure } from "../init";

export const mediaEditRouter = createTRPCRouter({
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

      // Fetch metadata and download content in parallel
      const [meta, downloadRes] = await Promise.all([
        drive.files.get({ fileId: input.fileId, fields: "id,name,mimeType" }),
        drive.files.get(
          { fileId: input.fileId, alt: "media" },
          { responseType: "arraybuffer" },
        ),
      ]);

      const mimeType = meta.data.mimeType ?? "image/jpeg";
      const fileName = meta.data.name ?? "image.jpg";

      const buffer = Buffer.from(
        downloadRes.data as ArrayBuffer | SharedArrayBuffer,
      );

      // Rotate with jimp (pure JS, edge-safe). jimp rotates counter-clockwise.
      const image = await Jimp.fromBuffer(buffer);
      image.rotate(input.degrees);
      const rotatedBuffer = await image.getBuffer(
        mimeType as Parameters<typeof image.getBuffer>[0],
      );

      // Upload back to Drive, replacing the original file, preserving name/location
      await drive.files.update({
        fileId: input.fileId,
        media: {
          mimeType,
          body: Readable.from(rotatedBuffer),
        },
      });

      return { success: true, fileId: input.fileId, fileName };
    }),
});
