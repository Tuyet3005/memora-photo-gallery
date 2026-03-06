import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Folder,
  Loader2,
  Upload,
  Video,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import { useTRPC } from "#/integrations/trpc/react";
import { authClient } from "#/lib/auth-client";

type FileUploadStatus = "pending" | "retrying" | "done" | "error";

interface FileUploadEntry {
  name: string;
  status: FileUploadStatus;
  error?: string;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

// Drive's thumbnailLink ends with =s<size>; replace that to resize.
function lh3Src(thumbnailLink: string, size: number) {
  return thumbnailLink.replace(/=s\d+$/, `=s${size}`);
}

function ThumbnailImage({
  thumbnailLink,
  name,
  mimeType,
}: {
  thumbnailLink: string;
  name: string;
  mimeType: string;
}) {
  const [fullStarted, setFullStarted] = useState(false);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [lowLoaded, setLowLoaded] = useState(false);

  useEffect(() => {
    setTimeout(() => setFullStarted(true), 100); // Start loading the full image after a short delay
  }, []);

  return (
    <div className="relative h-16 w-full overflow-hidden rounded-md">
      {mimeType.startsWith("video/") && (
        <div className="absolute top-1 right-1 z-10 rounded-sm bg-black/70 p-0.5">
          <Video className="size-4 text-white" />
        </div>
      )}
      {!lowLoaded && !fullLoaded && (
        <Skeleton className="absolute inset-0 h-full w-full" />
      )}
      {!fullLoaded && (
        <img
          src={lh3Src(thumbnailLink, 20)}
          alt={name}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 blur-xs ${lowLoaded ? "opacity-100" : "opacity-0"}`}
          referrerPolicy="no-referrer"
          onLoad={() => setLowLoaded(true)}
        />
      )}
      {fullStarted && (
        <img
          src={lh3Src(thumbnailLink, 400)}
          alt={name}
          className={`h-full w-full object-cover ${fullLoaded ? "opacity-100" : "opacity-0"}`}
          referrerPolicy="no-referrer"
          onLoad={() => setTimeout(() => setFullLoaded(true), 300)}
        />
      )}
    </div>
  );
}

function AccountOption({
  image,
  name,
}: {
  image: string | null | undefined;
  name: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className="h-5 w-5 shrink-0">
        <AvatarImage src={image ?? undefined} alt="" />
        <AvatarFallback className="text-[10px]">
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
    </div>
  );
}

export function GalleryPage() {
  const trpc = useTRPC();
  const { data: session } = authClient.useSession();
  const [folderStack, setFolderStack] = useState<
    { id: string; name: string }[]
  >([]);

  const currentFolder = folderStack[folderStack.length - 1];

  const { data: files, isPending } = useQuery(
    trpc.drive.listFiles.queryOptions({ folderId: currentFolder?.id }),
  );

  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadEntries, setUploadEntries] = useState<FileUploadEntry[]>([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedDelegationId, setSelectedDelegationId] = useState<
    string | null
  >(null);
  const [delegationInitialized, setDelegationInitialized] = useState(false);

  const { data: grantorData } = useQuery(
    trpc.user.listMyGrantors.queryOptions(),
  );

  useEffect(() => {
    if (grantorData && !delegationInitialized) {
      setSelectedDelegationId(grantorData.selectedDelegationId ?? null);
      setDelegationInitialized(true);
    }
  }, [grantorData, delegationInitialized]);

  const setPreference = useMutation(
    trpc.user.setUploadDelegationPreference.mutationOptions(),
  );

  const generateUploadUrl = useMutation(
    trpc.drive.generateUploadUrl.mutationOptions(),
  );

  function openFolder(id: string, name: string) {
    setFolderStack((prev) => [...prev, { id, name }]);
  }

  const uploading = uploadEntries.some(
    (e) => e.status === "pending" || e.status === "retrying",
  );

  async function uploadOne(file: File): Promise<void> {
    const MAX_ATTEMPTS = 3;
    let lastError = "Upload failed";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        setUploadEntries((prev) =>
          prev.map((e) =>
            e.name === file.name
              ? {
                  ...e,
                  status: "retrying",
                  error: `Retrying (${attempt}/${MAX_ATTEMPTS})…`,
                }
              : e,
          ),
        );
      }

      try {
        const { uploadId } = await generateUploadUrl.mutateAsync({
          fileName: file.name,
          mimeType: file.type,
          folderId: currentFolder?.id,
          uploadDelegationId: selectedDelegationId ?? undefined,
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

        setUploadEntries((prev) =>
          prev.map((e) =>
            e.name === file.name
              ? { ...e, status: "done", error: undefined }
              : e,
          ),
        );
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Upload failed";
      }
    }

    setUploadEntries((prev) =>
      prev.map((e) =>
        e.name === file.name ? { ...e, status: "error", error: lastError } : e,
      ),
    );
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const entries: FileUploadEntry[] = files.map((f) => ({
      name: f.name,
      status: "pending",
    }));
    setUploadEntries(entries);
    setUploadDialogOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = "";

    await Promise.all(files.map(uploadOne));

    await queryClient.invalidateQueries(
      trpc.drive.listFiles.queryOptions({ folderId: currentFolder?.id }),
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent
          className="max-w-sm"
          onInteractOutside={(e) => uploading && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {uploading ? "Uploading…" : "Upload complete"}
            </DialogTitle>
          </DialogHeader>
          {uploading && (
            <p className="text-muted-foreground text-sm sm:hidden">
              Please don't leave this page while uploading.
            </p>
          )}
          <ul className="mt-1 space-y-2">
            {uploadEntries.map((entry) => (
              <li key={entry.name} className="flex items-start gap-2 text-sm">
                {(entry.status === "pending" ||
                  entry.status === "retrying") && (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                )}
                {entry.status === "done" && (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                )}
                {entry.status === "error" && (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{entry.name}</p>
                  {entry.error && (
                    <p
                      className={`text-xs ${entry.status === "retrying" ? "text-muted-foreground" : "text-red-500"}`}
                    >
                      {entry.error}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!uploading && (
            <Button
              className="mt-2 w-full"
              onClick={() => setUploadDialogOpen(false)}
            >
              Done
            </Button>
          )}
        </DialogContent>
      </Dialog>

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

        <div className="flex items-center gap-2">
          {grantorData && grantorData.grantors.length > 0 && (
            <Select
              value={selectedDelegationId ?? "me"}
              onValueChange={(val) => {
                const newId = val === "me" ? null : val;
                setSelectedDelegationId(newId);
                setPreference.mutate({ delegationId: newId });
              }}
            >
              <SelectTrigger size="sm" className="w-44">
                {selectedDelegationId === null ? (
                  <AccountOption
                    image={session?.user.image}
                    name={session?.user.name ?? "Me"}
                  />
                ) : (
                  (() => {
                    const g = grantorData.grantors.find(
                      (x) => x.delegationId === selectedDelegationId,
                    );
                    return g ? (
                      <AccountOption
                        image={g.grantorImage}
                        name={g.grantorName}
                      />
                    ) : (
                      <SelectValue placeholder="Upload as…" />
                    );
                  })()
                )}
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="me">
                  <AccountOption
                    image={session?.user.image}
                    name={session?.user.name ?? "Me"}
                  />
                </SelectItem>
                {grantorData.grantors.map((g) => (
                  <SelectItem key={g.delegationId} value={g.delegationId}>
                    <AccountOption
                      image={g.grantorImage}
                      name={g.grantorName}
                    />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    uploading || (!!selectedDelegationId && !currentFolder)
                  }
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </Button>
              </span>
            </TooltipTrigger>
            {selectedDelegationId && !currentFolder && (
              <TooltipContent>
                You must upload to a folder when using delegation
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </div>

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
                  {f.thumbnailLink && (
                    <ThumbnailImage
                      thumbnailLink={f.thumbnailLink}
                      name={f.name ?? ""}
                      mimeType={f.mimeType ?? ""}
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
