import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Folder, Upload } from "lucide-react";
import { useRef, useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { useTRPC } from "#/integrations/trpc/react";

const FOLDER_MIME = "application/vnd.google-apps.folder";

function ThumbnailImage({ fileId, name }: { fileId: string; name: string }) {
  const [fullLoaded, setFullLoaded] = useState(false);
  const [lowLoaded, setLowLoaded] = useState(false);

  return (
    <div className="relative h-16 w-full overflow-hidden rounded-md">
      {!lowLoaded && !fullLoaded && (
        <Skeleton className="absolute inset-0 h-full w-full" />
      )}
      {!fullLoaded && (
        <img
          src={`https://drive.google.com/thumbnail?id=${fileId}&sz=w10`}
          alt={name}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${lowLoaded ? "opacity-100" : "opacity-0"}`}
          referrerPolicy="no-referrer"
          onLoad={() => setLowLoaded(true)}
        />
      )}
      <img
        src={`https://drive.google.com/thumbnail?id=${fileId}&sz=w200`}
        alt={name}
        className={`h-full w-full object-cover transition-opacity duration-300 ${fullLoaded ? "opacity-100" : "opacity-0"}`}
        referrerPolicy="no-referrer"
        onLoad={() => setFullLoaded(true)}
      />
    </div>
  );
}

export function GalleryPage() {
  const trpc = useTRPC();
  const [folderStack, setFolderStack] = useState<
    { id: string; name: string }[]
  >([]);

  const currentFolder = folderStack[folderStack.length - 1];

  const {
    data: files,
    isPending,
    error,
  } = useQuery(
    trpc.drive.listFiles.queryOptions({ folderId: currentFolder?.id }),
  );

  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadPending, setUploadPending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const generateUploadUrl = useMutation(
    trpc.drive.generateUploadUrl.mutationOptions(),
  );

  function openFolder(id: string, name: string) {
    setFolderStack((prev) => [...prev, { id, name }]);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadPending(true);
    setUploadError(null);

    try {
      const { uploadId } = await generateUploadUrl.mutateAsync({
        fileName: file.name,
        mimeType: file.type,
        folderId: currentFolder?.id,
      });

      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`/api/upload/${uploadId}`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Upload failed (${res.status})`);
      }

      await queryClient.invalidateQueries(
        trpc.drive.listFiles.queryOptions({ folderId: currentFolder?.id }),
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadPending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center justify-between gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              {folderStack.length === 0 ? (
                <BreadcrumbPage className="text-3xl font-bold text-(--sea-ink)">
                  Your gallery
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  className="cursor-pointer text-3xl font-bold"
                  onClick={() => setFolderStack([])}
                >
                  Your gallery
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {folderStack.map((folder, i) => {
              const isLast = i === folderStack.length - 1;
              return (
                <>
                  <BreadcrumbSeparator key={`sep-${folder.id}`} />
                  <BreadcrumbItem key={folder.id}>
                    {isLast ? (
                      <BreadcrumbPage className="text-3xl font-bold text-(--sea-ink)">
                        {folder.name}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink
                        className="cursor-pointer text-3xl font-bold"
                        onClick={() =>
                          setFolderStack((prev) => prev.slice(0, i + 1))
                        }
                      >
                        {folder.name}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>

        <Button
          variant="outline"
          size="sm"
          disabled={uploadPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-2 h-4 w-4" />
          {uploadPending ? "Uploading…" : "Upload"}
        </Button>
      </div>

      {uploadError && (
        <p className="mt-3 text-sm text-red-500">
          Upload failed: {uploadError}
        </p>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-500">
          Failed to load files: {error.message}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {isPending
          ? Array.from({ length: 10 }, (_, i) => `skeleton-${i}`).map((key) => (
              <div
                key={key}
                className="flex flex-col items-center gap-2 rounded-xl border border-(--line) bg-(--surface) p-3"
              >
                <Skeleton className="h-16 w-full rounded-md" />
                <Skeleton className="h-3 w-3/4 rounded" />
              </div>
            ))
          : files?.map((f) => {
              const isFolder = f.mimeType === FOLDER_MIME;
              if (isFolder) {
                return (
                  <button
                    key={f.id}
                    type="button"
                    className="flex flex-col items-center gap-2 rounded-xl border border-(--line) bg-(--surface) p-3 text-center cursor-pointer hover:bg-(--surface-hover) w-full"
                    onClick={() => openFolder(f.id ?? "", f.name ?? "")}
                  >
                    <Folder className="h-16 w-16 text-(--lagoon-deep)" />
                    <span className="w-full truncate text-xs text-(--sea-ink)">
                      {f.name}
                    </span>
                  </button>
                );
              }
              return (
                <div
                  key={f.id}
                  className="flex flex-col items-center gap-2 rounded-xl border border-(--line) bg-(--surface) p-3 text-center"
                >
                  <ThumbnailImage fileId={f.id ?? ""} name={f.name ?? ""} />
                  <span className="w-full truncate text-xs text-(--sea-ink)">
                    {f.name}
                  </span>
                </div>
              );
            })}
      </div>
    </main>
  );
}
