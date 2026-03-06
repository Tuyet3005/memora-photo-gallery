import { useQuery } from "@tanstack/react-query";
import { Folder } from "lucide-react";
import { useState } from "react";
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

  const {
    data: files,
    isPending,
    error,
  } = useQuery(trpc.drive.listFiles.queryOptions());

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
                    <ThumbnailImage fileId={f.id ?? ""} name={f.name ?? ""} />
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
