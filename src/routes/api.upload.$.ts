import { Readable } from "node:stream";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq, gt } from "drizzle-orm";
import { db } from "#/db/index";
import { imageOriginalVersion, signedUpload } from "#/db/schema";
import { getAuthedDrive } from "#/lib/drive";

async function handler({ request }: { request: Request }) {
  const url = new URL(request.url);
  const uploadId = url.pathname.split("/api/upload/")[1];

  if (!uploadId) {
    return Response.json({ error: "Missing upload ID" }, { status: 400 });
  }

  const now = new Date();
  const row = await db
    .select()
    .from(signedUpload)
    .where(and(eq(signedUpload.id, uploadId), gt(signedUpload.expiresAt, now)))
    .limit(1)
    .get();

  if (!row) {
    return Response.json(
      { error: "Upload token not found or expired" },
      { status: 401 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file field" }, { status: 400 });
  }

  let drive: Awaited<ReturnType<typeof getAuthedDrive>>;
  try {
    drive = await getAuthedDrive(row.userId);
  } catch {
    return Response.json(
      { error: "No Google access token. Please sign in again." },
      { status: 401 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parent = row.folderId ?? "root";

    // Check if a file with the same name already exists in the target folder
    const existing = await drive.files.list({
      q: `'${parent}' in parents and name = '${row.fileName.replace(/'/g, "\\'")}' and trashed = false`,
      fields: "files(id)",
      pageSize: 1,
    });
    const existingId = existing.data.files?.[0]?.id;

    const resData = existingId
      ? (
          await drive.files.update({
            fileId: existingId,
            media: { mimeType: row.mimeType, body: Readable.from(buffer) },
            fields: "id,name,mimeType",
          })
        ).data
      : (
          await drive.files.create({
            requestBody: { name: row.fileName, parents: [parent] },
            media: { mimeType: row.mimeType, body: Readable.from(buffer) },
            fields: "id,name,mimeType",
          })
        ).data;

    await Promise.all([
      db.delete(signedUpload).where(eq(signedUpload.id, uploadId)),
      existingId &&
        db
          .delete(imageOriginalVersion)
          .where(eq(imageOriginalVersion.fileId, existingId)),
    ]);

    return Response.json(
      { fileId: resData.id, name: resData.name, mimeType: resData.mimeType },
      { status: 200 },
    );
  } catch (error) {
    console.error("Google Drive upload error:", error);

    return Response.json(
      { error: "Google Drive upload failed" },
      { status: 502 },
    );
  }
}

export const Route = createFileRoute("/api/upload/$")({
  server: {
    handlers: {
      POST: handler,
    },
  },
});
