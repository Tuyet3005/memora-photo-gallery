import { useQuery } from "@tanstack/react-query";
import { Folder } from "lucide-react";
import { useTRPC } from "#/integrations/trpc/react";

const FOLDER_MIME = "application/vnd.google-apps.folder";

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

      {isPending && (
        <p className="mt-4 text-sm text-(--sea-ink-soft)">Loading files…</p>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-500">
          Failed to load files: {error.message}
        </p>
      )}

      {files && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {files.map((f) => {
            const isFolder = f.mimeType === FOLDER_MIME;
            return (
              <div
                key={f.id}
                className="flex flex-col items-center gap-2 rounded-xl border border-(--line) bg-(--surface) p-3 text-center"
              >
                {isFolder ? (
                  <Folder className="h-16 w-16 text-(--lagoon-deep)" />
                ) : (
                  <img
                    src={`https://drive.google.com/thumbnail?id=${f.id}&sz=w200`}
                    alt={f.name ?? ""}
                    className="h-16 w-full rounded-md object-cover"
                    referrerPolicy="no-referrer"
                  />
                )}
                <span className="w-full truncate text-xs text-(--sea-ink)">
                  {f.name}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
