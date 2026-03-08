import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  CheckCircle2,
  Copy,
  Folder,
  Home,
  Loader2,
  RefreshCw,
  Share2,
  Upload,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import { Textarea } from "#/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import { useTRPC } from "#/integrations/trpc/react";
import { authClient } from "#/lib/auth-client";
import { NOTE_EDITOR_EMAILS } from "#/lib/constants";
import { cn } from "#/lib/utils";
import { ImageCarousel } from "./ImageCarousel";
import { ThumbnailImage } from "./ThumbnailImage";

type FileUploadStatus = "pending" | "retrying" | "done" | "error";

interface FileUploadEntry {
  name: string;
  status: FileUploadStatus;
  error?: string;
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

const YOUR_GALLERY = { id: "", name: "Memora" };

function FolderNoteEditorInner({ folderId }: { folderId: string }) {
  const trpc = useTRPC();
  const { data } = useQuery({
    ...trpc.folder.getNote.queryOptions({ folderId }),
    enabled: !!folderId,
    refetchOnWindowFocus: false,
  });
  const updateNote = useMutation(trpc.folder.updateNote.mutationOptions());

  const [value, setValue] = useState(data?.note ?? "");
  const [pending, setPending] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (data !== undefined) {
      setValue(data.note);
    }
  }, [data]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setValue(next);
    setPending(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateNote.mutate(
        { folderId, note: next },
        { onSettled: () => setPending(false) },
      );
    }, 800);
  }

  return (
    <div className="relative mt-2 flex-1 mb-10">
      <Textarea
        className="resize-none h-full"
        placeholder="Notes…"
        value={value}
        onChange={handleChange}
      />
      <div className="absolute bottom-2 right-2 text-muted-foreground">
        {pending || updateNote.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : updateNote.isSuccess ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        ) : null}
      </div>
    </div>
  );
}

function FolderNoteEditor({ folderId }: { folderId: string }) {
  return <FolderNoteEditorInner key={folderId} folderId={folderId} />;
}

export function GalleryPage() {
  const trpc = useTRPC();
  const { data: session } = authClient.useSession();
  const canEditNotes = NOTE_EDITOR_EMAILS.includes(
    session?.user.email as (typeof NOTE_EDITOR_EMAILS)[number],
  );
  const navigate = useNavigate();
  const search = useSearch({ from: "/" });

  // folderStack always has YOUR_GALLERY as index 0
  const [folderStack, setFolderStack] = useState<
    { id: string; name: string }[]
  >(() => {
    if (search.folder && search.name) {
      return [YOUR_GALLERY, { id: search.folder, name: search.name }];
    }
    return [YOUR_GALLERY];
  });
  const [folderStackInitialized, setFolderStackInitialized] = useState(false);

  const currentFolder = folderStack[folderStack.length - 1];
  // Pass undefined for root (empty id = Your gallery)
  const currentFolderId = currentFolder.id || undefined;

  const { data: foldersData, isPending } = useQuery({
    ...trpc.drive.listFolders.queryOptions({ folderId: currentFolderId }),
    enabled: folderStackInitialized,
    refetchOnWindowFocus: false,
  });

  // Only hide content when there's no cached data at all for this folder.
  const folders = isPending ? undefined : (foldersData ?? []);

  // Collect fileIds of folders that have a thumbnail set, then fetch fresh links
  const thumbnailFileIds = (folders ?? [])
    .map((f) => f.thumbnail?.fileId)
    .filter(Boolean) as string[];
  const { data: folderThumbnailLinks } = useQuery({
    ...trpc.drive.getFolderThumbnails.queryOptions({
      fileIds: thumbnailFileIds,
    }),
    enabled: thumbnailFileIds.length > 0,
    refetchOnWindowFocus: false,
  });

  const parentFolderId =
    folderStack.length >= 2
      ? folderStack[folderStack.length - 2].id || undefined
      : undefined;
  const { data: parentFoldersData } = useQuery({
    ...trpc.drive.listFolders.queryOptions({ folderId: parentFolderId }),
    enabled: folderStackInitialized && folderStack.length >= 2,
    refetchOnWindowFocus: false,
  });
  const currentFolderThumbnailFileId =
    currentFolderId && parentFoldersData
      ? (parentFoldersData.find((f) => f.id === currentFolderId)?.thumbnail
          ?.fileId ?? null)
      : null;

  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadEntries, setUploadEntries] = useState<FileUploadEntry[]>([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedDelegationId, setSelectedDelegationId] = useState<
    string | null
  >(null);
  const [delegationInitialized, setDelegationInitialized] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const { data: preferences } = useQuery(
    trpc.user.getPreferences.queryOptions(),
  );

  const { data: grantorData } = useQuery(
    trpc.user.listMyGrantors.queryOptions(),
  );

  const { data: homeFolderPath } = useQuery({
    ...trpc.drive.getFolderPath.queryOptions({
      folderId: preferences?.homeFolderId ?? "",
    }),
    enabled: !!preferences?.homeFolderId,
  });

  const { data: urlFolderPath } = useQuery({
    ...trpc.drive.getFolderPath.queryOptions({
      folderId: search.folder ?? "",
    }),
    enabled: !!search.folder,
  });

  // Initialize folderStack from home folder on first load
  useEffect(() => {
    if (folderStackInitialized) return;
    if (!preferences) return;
    if (preferences.homeFolderId && !homeFolderPath) return; // wait for path
    // If URL specifies a folder, wait for its path before initializing
    if (search.folder && !urlFolderPath) return;
    setFolderStackInitialized(true);
    if (search.folder && urlFolderPath) {
      setFolderStack([YOUR_GALLERY, ...urlFolderPath]);
    } else if (homeFolderPath) {
      setFolderStack([YOUR_GALLERY, ...homeFolderPath]);
    }
  }, [
    preferences,
    homeFolderPath,
    urlFolderPath,
    folderStackInitialized,
    search.folder,
  ]);

  // visibleStack: everything from the first "Memora" entry onward, otherwise full stack
  const memoraIdx = folderStack.findIndex((f) => f.name === "Memora");
  const visibleStack =
    memoraIdx !== -1 ? folderStack.slice(memoraIdx) : folderStack;

  const setHomeFolderPreference = useMutation(
    trpc.user.setHomeFolderPreference.mutationOptions(),
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

  const setFolderThumbnailMutation = useMutation(
    trpc.drive.setFolderThumbnail.mutationOptions(),
  );

  const generateUploadUrl = useMutation(
    trpc.drive.generateUploadUrl.mutationOptions(),
  );

  const createFolderShare = useMutation(
    trpc.share.createFolderShare.mutationOptions(),
  );

  function handleShare() {
    if (!currentFolderId) return;
    createFolderShare.mutate(
      { folderId: currentFolderId },
      {
        onSuccess: ({ shareId }) => {
          const url = `${window.location.origin}/share/${shareId}`;
          setShareLink(url);
          setShareDialogOpen(true);
          navigator.clipboard.writeText(url).then(() => {
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 2000);
          });
        },
      },
    );
  }

  function handleCopyShareLink() {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  function openFolder(id: string, name: string) {
    setFolderStack((prev) => [...prev, { id, name }]);
    const isHome = id === preferences?.homeFolderId;
    navigate({
      to: "/",
      search: isHome ? {} : { name, folder: id },
      replace: false,
    });
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
          folderId: currentFolderId,
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

    await Promise.all([
      queryClient.invalidateQueries(
        trpc.drive.listFolders.queryOptions({ folderId: currentFolderId }),
      ),
      queryClient.invalidateQueries({
        queryKey: trpc.drive.listMedia.infiniteQueryKey({
          folderId: currentFolderId,
        }),
      }),
    ]);
    setUploadCount((c) => c + 1);
  }

  return (
    <main className="mx-auto max-w-6xl py-12">
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

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Share folder</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Anyone with this link can view the photos in this folder.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareLink ?? ""}
              className="flex-1 rounded-md border border-input bg-muted px-3 py-2 text-sm"
            />
            <Button
              size="icon"
              variant="outline"
              onClick={handleCopyShareLink}
              aria-label="Copy link"
              className={cn(shareCopied && "text-green-600")}
            >
              {shareCopied ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Breadcrumb className="w-full">
        <BreadcrumbList>
          {visibleStack.map((folder, i) => {
            const isLast = i === visibleStack.length - 1;
            const isRoot = folder.id === "";
            const isHome = isRoot
              ? preferences?.homeFolderId === null
              : preferences?.homeFolderId === folder.id;
            // Find the real index in folderStack to slice correctly on navigate
            const stackIdx = folderStack.indexOf(folder);
            return (
              <>
                {i > 0 && <BreadcrumbSeparator key={`sep-${stackIdx}`} />}
                <BreadcrumbItem
                  key={`item-${stackIdx}`}
                  className="flex items-center gap-1"
                >
                  {isLast ? (
                    <BreadcrumbPage className="text-3xl font-bold text-(--sea-ink)">
                      {folder.name}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      className="cursor-pointer text-3xl font-bold"
                      onClick={() => {
                        const newStack = folderStack.slice(0, stackIdx + 1);
                        setFolderStack(newStack);
                        const top = newStack[newStack.length - 1];
                        const topIsHome = top.id === preferences?.homeFolderId;
                        if (top.id && !topIsHome) {
                          navigate({
                            to: "/",
                            search: { name: top.name, folder: top.id },
                            replace: false,
                          });
                        } else {
                          navigate({ to: "/", search: {}, replace: false });
                        }
                      }}
                    >
                      {folder.name}
                    </BreadcrumbLink>
                  )}
                  {preferences !== undefined && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="ml-1 rounded p-0.5 hover:bg-muted"
                          onClick={() => {
                            setHomeFolderPreference.mutate(
                              {
                                folderId: isHome
                                  ? null
                                  : isRoot
                                    ? null
                                    : folder.id,
                              },
                              {
                                onSuccess: () =>
                                  queryClient.invalidateQueries(
                                    trpc.user.getPreferences.queryOptions(),
                                  ),
                              },
                            );
                          }}
                        >
                          <Home
                            className={`size-4 ${isHome ? "text-(--lagoon-deep)" : "text-muted-foreground"}`}
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isHome ? "Clear home folder" : "Set as home folder"}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </BreadcrumbItem>
              </>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 flex items-stretch gap-24">
        <div className="min-w-0 flex-1">
          {folderStackInitialized && (
            <ImageCarousel
              folderId={currentFolderId}
              uploadCount={uploadCount}
              currentThumbnailFileId={currentFolderThumbnailFileId}
              onThumbnailSet={(fileId) => {
                if (!currentFolderId) return;
                setFolderThumbnailMutation.mutate(
                  { folderId: currentFolderId, fileId },
                  {
                    onSuccess: () => {
                      toast.success("Folder thumbnail updated");
                      queryClient.invalidateQueries(
                        trpc.drive.listFolders.queryOptions({
                          folderId: parentFolderId,
                        }),
                      );
                    },
                  },
                );
              }}
            />
          )}

          {folders === undefined && (
            <div className="flex justify-center py-12">
              <img
                src="/loading.gif"
                alt="Loading…"
                className="w-[60%] max-w-52"
              />
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {folders?.map((f) => (
              <button
                key={f.id}
                type="button"
                className="relative overflow-hidden rounded-xl border border-(--line) bg-(--surface) cursor-pointer hover:opacity-90 w-full aspect-square"
                onClick={() => openFolder(f.id ?? "", f.name ?? "")}
              >
                {f.thumbnail && folderThumbnailLinks?.[f.thumbnail.fileId] ? (
                  <ThumbnailImage
                    thumbnailLink={folderThumbnailLinks[f.thumbnail.fileId]!}
                    name={f.name ?? ""}
                    mimeType="image/"
                    fitType="cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Folder className="h-16 w-16 text-(--lagoon-deep)" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-2 py-1.5">
                  <span className="block h-10 w-full text-sm leading-5 font-medium text-white line-clamp-2">
                    {f.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="sticky top-20 flex w-56 shrink-0 flex-col gap-2 self-stretch">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => {
              queryClient.resetQueries(
                trpc.drive.listFolders.queryOptions({
                  folderId: currentFolderId,
                }),
              );
              queryClient.resetQueries({
                queryKey: trpc.drive.listMedia.infiniteQueryKey({
                  folderId: currentFolderId,
                }),
              });
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {currentFolderId && (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              disabled={createFolderShare.isPending}
              onClick={handleShare}
            >
              {createFolderShare.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="mr-2 h-4 w-4" />
              )}
              Share
            </Button>
          )}
          {grantorData && grantorData.grantors.length > 0 && (
            <Select
              value={selectedDelegationId ?? "me"}
              onValueChange={(val) => {
                const newId = val === "me" ? null : val;
                setSelectedDelegationId(newId);
                setPreference.mutate({ delegationId: newId });
              }}
            >
              <SelectTrigger size="sm" className="w-full">
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
                  className="w-full justify-start"
                  disabled={
                    uploading || (!!selectedDelegationId && !currentFolderId)
                  }
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </Button>
              </span>
            </TooltipTrigger>
            {selectedDelegationId && !currentFolderId && (
              <TooltipContent>
                You must upload to a folder when using delegation
              </TooltipContent>
            )}
          </Tooltip>
          {currentFolderId && canEditNotes && (
            <FolderNoteEditor folderId={currentFolderId} />
          )}
        </aside>
      </div>
    </main>
  );
}
