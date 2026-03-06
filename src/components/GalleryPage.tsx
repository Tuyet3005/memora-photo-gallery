import { useMutation, useQuery } from "@tanstack/react-query";
import { Folder } from "lucide-react";
import { useEffect, useState } from "react";
import { Skeleton } from "#/components/ui/skeleton";
import { useTRPC } from "#/integrations/trpc/react";

const FOLDER_MIME = "application/vnd.google-apps.folder";

function ThumbnailImage({
  fileId,
  placeholder,
  name,
}: {
  fileId: string;
  placeholder: string | null;
  name: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [hidePlaceholder, setHidePlaceholder] = useState(false);

  return (
    <div className="relative h-16 w-full overflow-hidden rounded-md">
      {!loaded && <Skeleton className="absolute inset-0 h-full w-full" />}
      {placeholder && !hidePlaceholder && (
        <img
          src={placeholder}
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 h-full w-full scale-110 object-cover blur-sm transition-opacity duration-300 ${loaded ? "opacity-0" : "opacity-100"}`}
          onTransitionEnd={() => setHidePlaceholder(true)}
        />
      )}
      <img
        src={`https://drive.google.com/thumbnail?id=${fileId}&sz=w200`}
        alt={name}
        className={`relative h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

export function GalleryPage() {
  const trpc = useTRPC();

  const {
    data: files,
    isPending,
    error,
  } = useQuery(trpc.drive.listFiles.queryOptions());

  const imageIds =
    files
      ?.filter((f) => f.mimeType !== FOLDER_MIME && f.id)
      .map((f) => f.id as string) ?? [];

  const { data: thumbnails, mutate: loadThumbnails } = useMutation(
    trpc.drive.loadThumbnails.mutationOptions(),
  );

  useEffect(() => {
    if (imageIds.length > 0) loadThumbnails(imageIds);
  }, [imageIds, loadThumbnails]);

  const thumbnailMap = new Map(
    thumbnails
      ?.filter((t) => t.base64)
      .map((t) => [t.id, t.base64 as string]) ?? [],
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold text-(--sea-ink)">Your gallery</h1>

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
              return (
                <div
                  key={f.id}
                  className="flex flex-col items-center gap-2 rounded-xl border border-(--line) bg-(--surface) p-3 text-center"
                >
                  {isFolder ? (
                    <Folder className="h-16 w-16 text-(--lagoon-deep)" />
                  ) : (
                    <ThumbnailImage
                      fileId={f.id ?? ""}
                      name={f.name ?? ""}
                      placeholder={
                        f.id ? (thumbnailMap.get(f.id) ?? null) : null
                      }
                    />
                  )}
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
