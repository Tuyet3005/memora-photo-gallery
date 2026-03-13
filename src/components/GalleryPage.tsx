import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  CheckCircle2,
  Folder,
  FolderPlus,
  Home,
  Link,
  Loader2,
  Plus,
  RefreshCw,
  Share2,
  Upload,
  XCircle,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
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
    <>
      <Avatar className="size-4 shrink-0">
        <AvatarImage src={image ?? undefined} alt="" />
        <AvatarFallback className="text-[10px]">
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="truncate font-medium">{name}</span>
    </>
  );
}

const MEMORA_ROOT_NAME = "Memora";
const YOUR_GALLERY = { id: "", name: MEMORA_ROOT_NAME };

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
    <div className="relative mt-2 flex-1">
      <Textarea
        className="h-52 resize-none sm:h-full"
        placeholder="Notes…"
        value={value}
        onChange={handleChange}
      />
      <div className="absolute right-2 bottom-2 text-muted-foreground">
        {pending || updateNote.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : updateNote.isSuccess ? (
          <CheckCircle2 className="size-3.5 text-green-500" />
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
  const isHomeRequested = search.home === true;
  const isDriveRootRequested = search.root === true;

  // folderStack always has YOUR_GALLERY as index 0
  const [folderStack, setFolderStack] = useState<
    { id: string; name: string; canEdit?: boolean }[]
  >(() => {
    if (search.home) {
      return [YOUR_GALLERY];
    }
    if (search.root) {
      return [YOUR_GALLERY];
    }
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
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedDelegationId, setSelectedDelegationId] = useState<
    string | null
  >(null);
  const [delegationInitialized, setDelegationInitialized] = useState(false);

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
    enabled: !!search.folder && !isDriveRootRequested,
  });

  // Initialize folderStack from home folder on first load
  useEffect(() => {
    if (folderStackInitialized) return;
    if (!preferences) return;
    if (isHomeRequested) {
      if (preferences.homeFolderId && !homeFolderPath) return;
      setFolderStackInitialized(true);
      setFolderStack(
        homeFolderPath ? [YOUR_GALLERY, ...homeFolderPath] : [YOUR_GALLERY],
      );
      return;
    }
    if (isDriveRootRequested) {
      setFolderStackInitialized(true);
      setFolderStack([YOUR_GALLERY]);
      return;
    }
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
    isHomeRequested,
    isDriveRootRequested,
    search.folder,
  ]);

  useEffect(() => {
    if (!folderStackInitialized || !isHomeRequested || !preferences) return;
    if (preferences.homeFolderId && !homeFolderPath) return;
    setFolderStack(
      homeFolderPath ? [YOUR_GALLERY, ...homeFolderPath] : [YOUR_GALLERY],
    );
  }, [folderStackInitialized, homeFolderPath, isHomeRequested, preferences]);

  useEffect(() => {
    if (!folderStackInitialized || !isDriveRootRequested) return;
    setFolderStack([YOUR_GALLERY]);
  }, [folderStackInitialized, isDriveRootRequested]);

  // visibleStack: show from root, but skip synthetic root if the real path already starts with the same name
  const visibleStack =
    folderStack.length > 1 && folderStack[1].name === MEMORA_ROOT_NAME
      ? folderStack.slice(1)
      : folderStack;

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

  const createFolder = useMutation(trpc.drive.createFolder.mutationOptions());

  function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    createFolder.mutate(
      { name, parentFolderId: currentFolderId },
      {
        onSuccess: () => {
          toast.success("Folder created");
          setNewFolderDialogOpen(false);
          setNewFolderName("");
          queryClient.invalidateQueries(
            trpc.drive.listFolders.queryOptions({ folderId: currentFolderId }),
          );
        },
        onError: () => toast.error("Failed to create folder"),
      },
    );
  }

  function handleShare() {
    if (!currentFolderId) return;
    createFolderShare.mutate(
      { folderId: currentFolderId },
      {
        onSuccess: ({ shareId }) => {
          const url = `${window.location.origin}/share/${shareId}`;
          navigator.clipboard.writeText(url).then(() => {
            toast.success("Share link copied to clipboard");
          });
        },
      },
    );
  }

  function openFolder(id: string, name: string, canEdit?: boolean) {
    setFolderStack((prev) => [...prev, { id, name, canEdit }]);
    const isHome = id === preferences?.homeFolderId;
    navigate({
      to: "/",
      search: isHome
        ? {}
        : { home: undefined, name, folder: id, root: undefined },
      replace: false,
    });
  }

  const uploading = uploadEntries.some(
    (e) => e.status === "pending" || e.status === "retrying",
  );
  const isDelegatedAtRoot = !!selectedDelegationId && !currentFolderId;

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

  const ancestorFolders = useMemo(
    () =>
      folderStack
        // Skip everything up to and including the Memora root folder (+1 for the root, +1 to skip it)
        .slice(folderStack.findIndex((f) => f.name === MEMORA_ROOT_NAME) + 2)
        .filter((f) => !!f.id && f.canEdit !== false)
        .map((f) => ({
          id: f.id,
          name: f.name,
          thumbnailFileId:
            f.id === currentFolderId ? currentFolderThumbnailFileId : null,
        })),
    [folderStack, currentFolderId, currentFolderThumbnailFileId],
  );

  return (
    <main className="mx-auto max-w-6xl px-8 py-4 sm:px-10">
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
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
                )}
                {entry.status === "done" && (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-500" />
                )}
                {entry.status === "error" && (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
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

      <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateFolder}>
            <Input
              autoFocus
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
            />
            <DialogFooter className="mt-4">
              <Button
                type="submit"
                disabled={!newFolderName.trim() || createFolder.isPending}
              >
                {createFolder.isPending && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Breadcrumb className="w-full">
        <BreadcrumbList>
          {visibleStack.map((folder, i) => {
            const isLast = i === visibleStack.length - 1;
            // Find the real index in folderStack to slice correctly on navigate
            const stackIdx = folderStack.indexOf(folder);
            return (
              <Fragment key={stackIdx}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage className="font-bold text-(--sea-ink) text-2xl leading-tight sm:text-3xl sm:leading-normal">
                      {folder.name}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      className="cursor-pointer font-bold text-2xl leading-tight sm:text-3xl sm:leading-normal"
                      onClick={() => {
                        const newStack = folderStack.slice(0, stackIdx + 1);
                        setFolderStack(newStack);
                        const top = newStack[newStack.length - 1];
                        const topIsHome = top.id === preferences?.homeFolderId;
                        if (top.id && !topIsHome) {
                          navigate({
                            to: "/",
                            search: {
                              home: undefined,
                              name: top.name,
                              folder: top.id,
                              root: undefined,
                            },
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
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 grid grid-cols-1 gap-4 [grid-template-areas:'content''media''actions'] lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-x-8 lg:[grid-template-areas:'content_content''media_actions']">
        <div className="min-w-0 [grid-area:media]">
          {folderStackInitialized && (
            <ImageCarousel
              folderId={currentFolderId}
              uploadCount={uploadCount}
              currentThumbnailFileId={currentFolderThumbnailFileId}
              ancestorFolders={ancestorFolders}
              onThumbnailSet={(fileId, targetFolderId) => {
                return new Promise<void>((resolve, reject) => {
                  const targetParentId =
                    folderStack[
                      folderStack.findIndex((f) => f.id === targetFolderId) - 1
                    ]?.id || undefined;
                  setFolderThumbnailMutation.mutate(
                    { folderId: targetFolderId, fileId },
                    {
                      onSuccess: () => {
                        toast.success("Folder thumbnail updated");
                        queryClient.invalidateQueries(
                          trpc.drive.listFolders.queryOptions({
                            folderId: targetParentId,
                          }),
                        );
                        resolve();
                      },
                      onError: () => reject(),
                    },
                  );
                });
              }}
            />
          )}
        </div>

        <aside className="grid h-full grid-cols-2 gap-2 pb-2 [grid-area:actions] lg:sticky lg:top-20 lg:flex lg:flex-col lg:gap-2 lg:self-start">
          <Button
            variant="outline"
            size="sm"
            className="w-full min-w-0 justify-start gap-1 px-2 lg:gap-1.5 lg:px-3"
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
            <RefreshCw className="size-4 shrink-0" />
            <span className="min-w-0 truncate">Refresh</span>
          </Button>
          {currentFolderId && (
            <Button
              variant="outline"
              size="sm"
              className="w-full min-w-0 justify-start gap-1 px-2 lg:gap-1.5 lg:px-3"
              disabled={createFolderShare.isPending}
              onClick={handleShare}
            >
              {createFolderShare.isPending ? (
                <Loader2 className="size-4 shrink-0 animate-spin" />
              ) : (
                <Share2 className="size-4 shrink-0" />
              )}
              <span className="min-w-0 truncate">Share</span>
            </Button>
          )}
          {preferences !== undefined && (
            <Button
              variant="outline"
              size="sm"
              className="w-full min-w-0 justify-start gap-1 px-2 lg:gap-1.5 lg:px-3"
              disabled={setHomeFolderPreference.isPending}
              onClick={() => {
                setHomeFolderPreference.mutate(
                  { folderId: currentFolderId ?? null },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries(
                        trpc.user.getPreferences.queryOptions(),
                      );
                      toast.success("Home folder updated");
                    },
                  },
                );
              }}
            >
              {setHomeFolderPreference.isPending ? (
                <Loader2 className="size-4 shrink-0 animate-spin" />
              ) : (
                <Home className="size-4 shrink-0" />
              )}
              <span className="min-w-0 truncate">Set home folder</span>
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
              <SelectTrigger size="sm" className="w-full min-w-0 justify-start">
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
          <DropdownMenu>
            <span className="w-full">
              <DropdownMenuTrigger data-size="sm" className="w-full min-w-0">
                <Plus className="size-4 shrink-0" />
                <span className="min-w-0 truncate">Add</span>
              </DropdownMenuTrigger>
            </span>
            <DropdownMenuContent align="end">
              {isDelegatedAtRoot ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <DropdownMenuItem disabled>
                        <Upload />
                        Upload files
                      </DropdownMenuItem>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    You must upload to a folder when using delegation
                  </TooltipContent>
                </Tooltip>
              ) : (
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <Upload />
                  Upload files
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => {
                  setNewFolderName("");
                  setNewFolderDialogOpen(true);
                }}
              >
                <FolderPlus />
                New folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {currentFolderId && canEditNotes && (
            <div className="col-span-2 mt-2 lg:flex lg:min-h-0 lg:flex-1">
              <FolderNoteEditor folderId={currentFolderId} />
            </div>
          )}
        </aside>

        {folders === undefined && (
          <div className="flex justify-center py-12 [grid-area:content]">
            <img
              src="/loading.gif"
              alt="Loading…"
              className="w-[60%] max-w-52"
            />
          </div>
        )}

        {folders && folders.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-4 [grid-area:content] md:grid-cols-4 lg:mt-6 lg:grid-cols-5">
            {folders.map((f) => (
              <button
                key={f.shortcutId ?? f.id}
                type="button"
                className="relative aspect-square w-full cursor-pointer overflow-hidden rounded-xl border border-(--line) bg-(--surface) hover:opacity-90"
                onClick={() => openFolder(f.id ?? "", f.name ?? "", f.canEdit)}
              >
                {f.isShortcut && (
                  <div className="absolute top-1 right-1 z-10 rounded-lg bg-black/50 p-1 text-white">
                    <Link className="size-3.5" />
                  </div>
                )}
                {f.thumbnail && folderThumbnailLinks?.[f.thumbnail.fileId] ? (
                  <ThumbnailImage
                    thumbnailLink={folderThumbnailLinks[f.thumbnail.fileId]!}
                    name={f.name ?? ""}
                    mimeType="image/"
                    fitType="cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Folder className="size-16 text-(--lagoon-deep)" />
                  </div>
                )}
                <div className="absolute right-0 bottom-0 left-0 bg-black/40 px-2 py-1.5">
                  <span className="line-clamp-2 block h-8 w-full font-medium text-white text-xs leading-4">
                    {f.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
