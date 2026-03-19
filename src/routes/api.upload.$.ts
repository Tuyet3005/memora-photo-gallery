import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "#/db/index";
import { signedUpload } from "#/db/schema";

/** Proxies upload chunks to Google Drive from the server to avoid browser CORS on resumable uploads. */
async function handler({ request }: { request: Request }) {
  const url = new URL(request.url);
  const uploadId = url.pathname.split("/api/upload/")[1];

  if (!uploadId) {
    return Response.json({ error: "Missing upload ID" }, { status: 400 });
  }

  const row = await db
    .select()
    .from(signedUpload)
    .where(eq(signedUpload.id, uploadId))
    .limit(1)
    .get();

  if (!row) {
    return Response.json({ error: "Upload token not found" }, { status: 401 });
  }

  const contentRange = request.headers.get("Content-Range");
  if (!contentRange) {
    return Response.json({ error: "Missing Content-Range" }, { status: 400 });
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (bytes.byteLength < 1) {
    return Response.json({ error: "Chunk body is required" }, { status: 400 });
  }

  try {
    const uploadResponse = await fetch(row.resumableUri, {
      method: "PUT",
      headers: {
        "Content-Type":
          request.headers.get("Content-Type") ?? "application/octet-stream",
        "Content-Range": contentRange,
      },
      body: Buffer.from(bytes),
    });

    if (uploadResponse.status === 308) {
      return new Response(null, {
        status: 308,
        headers: {
          Range: uploadResponse.headers.get("Range") ?? "",
        },
      });
    }

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text().catch(() => "");
      return Response.json(
        { error: errorText || "Google Drive upload chunk failed" },
        { status: 502 },
      );
    }

    // A successful non-308 response means Drive accepted the final chunk.
    await db.delete(signedUpload).where(eq(signedUpload.id, uploadId));

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Google Drive chunk upload proxy error:", error);
    return Response.json(
      { error: "Google Drive upload chunk failed" },
      { status: 502 },
    );
  }
}

export const Route = createFileRoute("/api/upload/$")({
  server: {
    handlers: {
      PUT: handler,
    },
  },
});
