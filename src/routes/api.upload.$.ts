import { Readable } from "node:stream";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq, gt } from "drizzle-orm";
import { google } from "googleapis";
import { db } from "#/db/index";
import { account, signedUpload } from "#/db/schema";

async function handler({ request }: { request: Request }) {
  const url = new URL(request.url);
  const uploadId = url.pathname.split("/api/upload/")[1];

  if (!uploadId) {
    return Response.json({ error: "Missing upload ID" }, { status: 400 });
  }

  const now = new Date();
  const [row] = await db
    .select()
    .from(signedUpload)
    .where(and(eq(signedUpload.id, uploadId), gt(signedUpload.expiresAt, now)))
    .limit(1);

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

  const [googleAccount] = await db
    .select()
    .from(account)
    .where(eq(account.userId, row.userId))
    .limit(1);

  if (!googleAccount?.accessToken) {
    return Response.json(
      { error: "No Google access token. Please sign in again." },
      { status: 401 },
    );
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2.setCredentials({
    access_token: googleAccount.accessToken,
    refresh_token: googleAccount.refreshToken ?? undefined,
    expiry_date: googleAccount.accessTokenExpiresAt?.getTime() ?? undefined,
  });
  oauth2.on("tokens", async (tokens) => {
    await db
      .update(account)
      .set({
        accessToken: tokens.access_token ?? googleAccount.accessToken,
        ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
        ...(tokens.expiry_date && {
          accessTokenExpiresAt: new Date(tokens.expiry_date),
        }),
      })
      .where(eq(account.id, googleAccount.id));
  });

  const drive = google.drive({ version: "v3", auth: oauth2 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const stream = Readable.from(buffer);

    const res = await drive.files.create({
      requestBody: {
        name: row.fileName,
        parents: [row.folderId ?? "root"],
      },
      media: {
        mimeType: row.mimeType,
        body: stream,
      },
      fields: "id,name,mimeType",
    });

    await db.delete(signedUpload).where(eq(signedUpload.id, uploadId));

    return Response.json(
      { fileId: res.data.id, name: res.data.name, mimeType: res.data.mimeType },
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
