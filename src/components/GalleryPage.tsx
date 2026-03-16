import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  CheckCircle2,
  Edit3,
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
import { formatDuration, groupBy, sleep } from "#/lib/utils";
import { ImageCarousel } from "./ImageCarousel";
import { ThumbnailImage } from "./ThumbnailImage";

type FileUploadStatus = "pending" | "retrying" | "done" | "error";

interface FolderStack {
  id: string;
  name: string;
  canEdit?: boolean;
}

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

  const { data: preferences } = useQuery(
    trpc.user.getPreferences.queryOptions(),
  );
  const { data: homeFolderPath } = useQuery({
    ...trpc.drive.getFolderPath.queryOptions({
      folderId: preferences?.homeFolderId ?? "",
    }),
    enabled: !!preferences?.homeFolderId,
  });
  const folderStackFromPreference = preferences?.homeFolderId
    ? homeFolderPath
    : undefined;
  const folderStackFromQuery =
    search.folder && search.name
      ? [{ id: search.folder, name: search.name }]
      : undefined;

  const requestedFolder = {
    [Number(!!folderStackFromPreference)]: {
      source: "preference" as const,
      stack: folderStackFromPreference!,
    },
    [Number(search.root === true)]: {
      source: "root" as const,
      stack: [],
    },
    [Number(!!folderStackFromQuery)]: {
      source: "query" as const,
      stack: folderStackFromQuery!,
    },
  }[Number(true)];

  const requestedFolderStack = requestedFolder?.stack;

  const { data: folderPath } = useQuery({
    ...trpc.drive.getFolderPath.queryOptions({
      folderId: requestedFolderStack?.at(-1)?.id ?? "",
    }),
    enabled: requestedFolderStack?.length > 0,
  });

  const [folderStack, setFolderStack] = useState<FolderStack[]>(
    requestedFolderStack ?? [YOUR_GALLERY],
  );

  useEffect(() => {
    if (folderPath) {
      setFolderStack([YOUR_GALLERY, ...folderPath]);
    }
  }, [folderPath]);

  const currentFolder = folderStack.at(-1);
  // Pass undefined for root (empty id = Your gallery)
  const currentFolderId = currentFolder?.id || undefined;

  const { data: foldersData, isFoldersDataPending } = useQuery({
    ...trpc.drive.listFolders.queryOptions({ folderId: currentFolderId }),
    enabled: !!requestedFolderStack,
    refetchOnWindowFocus: false,
  });

  const fetchFolderCreationTime = useMutation(
    trpc.drive.fetchFolderCreationTime.mutationOptions(),
  );

  const [fetchedCreationTimes, setFetchedCreationTimes] = useState<
    Record<string, Date | null>
  >({});

  // Only hide content when there's no cached data at all for this folder.
  const folders = isFoldersDataPending ? undefined : (foldersData ?? []);
  const pendingCreationTimeFolderIds = useMemo(
    () =>
      (folders ?? [])
        .filter(
          (folder) =>
            fetchedCreationTimes[folder.id] === undefined &&
            !folder.metadata?.creationTime,
        )
        .map((folder) => folder.id),
    [folders, fetchedCreationTimes],
  );

  useEffect(() => {
    if (pendingCreationTimeFolderIds.length === 0) return;
    if (fetchFolderCreationTime.isPending) return;

    const batchFolderIds = pendingCreationTimeFolderIds.slice(0, 20);
    if (batchFolderIds.length === 0) return;

    fetchFolderCreationTime
      .mutateAsync({ folderIds: batchFolderIds })
      .then((result) => {
        // Treat any missing IDs as null so they are not retried.
        const completedBatch = Object.fromEntries(
          batchFolderIds.map((id) => [id, result[id] ?? null]),
        ) as Record<string, Date | null>;
        setFetchedCreationTimes((prev) => ({ ...prev, ...completedBatch }));
      })
      .catch(() => {
        // Mark failed IDs as null so hydration keeps progressing.
        setFetchedCreationTimes((prev) => ({
          ...prev,
          ...Object.fromEntries(batchFolderIds.map((id) => [id, null])),
        }));
      });
  }, [pendingCreationTimeFolderIds, fetchFolderCreationTime]);

  const foldersWithFetchedCreationTime = useMemo(() => {
    if (!folders) return undefined;

    return folders.map((folder) => ({
      ...folder,
      resolvedCreationTime:
        folder.id && fetchedCreationTimes[folder.id] !== undefined
          ? fetchedCreationTimes[folder.id]
          : (folder.metadata?.creationTime ?? null),
    }));
  }, [folders, fetchedCreationTimes]);

  const folderList = foldersWithFetchedCreationTime ?? [];

  const { foldersByCreationYear, ungroupedFolders } = useMemo(() => {
    const groupableFolders: typeof folderList = [];
    const ungrouped: typeof folderList = [];

    for (let i = 0; i < folderList.length; i++) {
      const folder = folderList[i];
      const createdAt = folder.resolvedCreationTime;
      if (!createdAt || Number.isNaN(createdAt.getTime())) {
        ungrouped.push(folder);
        continue;
      }

      groupableFolders.push(folder);
    }

    const byYear = Object.entries(
      groupBy(groupableFolders, (folder) =>
        String(folder.resolvedCreationTime?.getFullYear()),
      ),
    )
      .sort(([leftYear], [rightYear]) => Number(rightYear) - Number(leftYear))
      .map(([year, groupedFolders]) => ({ year, folders: groupedFolders }));

    return { foldersByCreationYear: byYear, ungroupedFolders: ungrouped };
  }, [folderList]);

  const folderSections = useMemo(() => {
    type FolderSection = {
      key: string;
      heading: string | null;
      folders: typeof folderList;
    };

    const sections: FolderSection[] = foldersByCreationYear.map((group) => ({
      key: group.year,
      heading: group.year,
      folders: group.folders,
    }));

    if (ungroupedFolders.length > 0) {
      sections.push({
        key: "ungrouped",
        heading: null,
        folders: ungroupedFolders,
      });
    }

    return sections;
  }, [foldersByCreationYear, ungroupedFolders]);

  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat("en-US", { month: "short" }),
    [],
  );

  // Collect fileIds of folders that have a thumbnail set, then fetch fresh links
  const thumbnailFileIds = (folders ?? [])
    .map((f) => f.metadata?.thumbnailFileId)
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
    enabled: !isFoldersDataPending && folderStack.length >= 2,
    refetchOnWindowFocus: false,
  });
  const currentFolderThumbnailFileId =
    currentFolderId && parentFoldersData
      ? (parentFoldersData.find((f) => f.id === currentFolderId)?.metadata
          ?.thumbnailFileId ?? null)
      : null;

  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadEntries, setUploadEntries] = useState<FileUploadEntry[]>([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadStartedAt, setUploadStartedAt] = useState<number | null>(null);
  const [uploadNow, setUploadNow] = useState(() => Date.now());
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameFolderDialogOpen, setRenameFolderDialogOpen] = useState(false);
  const [renameFolderId, setRenameFolderId] = useState("");
  const [renameFolderName, setRenameFolderName] = useState("");
  const [selectedDelegationId, setSelectedDelegationId] = useState<
    string | null
  >(null);
  const [delegationInitialized, setDelegationInitialized] = useState(false);

  const { data: grantorData } = useQuery(
    trpc.user.listMyGrantors.queryOptions(),
  );

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

  const renameFolder = useMutation(trpc.drive.renameFolder.mutationOptions());

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

  function handleStartRenameFolder(folderId: string, name: string) {
    setRenameFolderId(folderId);
    setRenameFolderName(name);
    setRenameFolderDialogOpen(true);
  }

  function handleRenameFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = renameFolderName.trim();
    if (!renameFolderId || !name) return;

    renameFolder.mutate(
      { folderId: renameFolderId, name },
      {
        onSuccess: () => {
          toast.success("Folder renamed");
          setRenameFolderDialogOpen(false);
          setRenameFolderId("");
          queryClient.invalidateQueries(
            trpc.drive.listFolders.queryOptions({ folderId: currentFolderId }),
          );
        },
        onError: () => toast.error("Failed to rename folder"),
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
    if (!confirmNavigationDuringUpload()) return;
    setFolderStack((prev) => [...prev, { id, name, canEdit }]);
    const isHome = id === preferences?.homeFolderId;
    navigate({
      to: "/",
      search: isHome ? {} : { name, folder: id, root: undefined },
      replace: false,
    });
  }

  const uploading = uploadEntries.some(
    (e) => e.status === "pending" || e.status === "retrying",
  );
  const totalUploads = uploadEntries.length;
  const completedUploads = uploadEntries.filter(
    (e) => e.status === "done" || e.status === "error",
  ).length;
  const failedUploads = uploadEntries.filter(
    (e) => e.status === "error",
  ).length;
  const uploadProgressPercent =
    totalUploads > 0 ? Math.round((completedUploads / totalUploads) * 100) : 0;
  const isDelegatedAtRoot = !!selectedDelegationId && !currentFolderId;
  const isCurrentFolderHome =
    (preferences?.homeFolderId ?? null) === (currentFolderId ?? null);
  const UPLOAD_BATCH_SIZE = 5;
  const MIN_BATCH_DURATION_MS = 1000;

  const elapsedUploadSeconds = uploadStartedAt
    ? Math.max(0.001, (uploadNow - uploadStartedAt) / 1000)
    : 0;
  const remainingUploads = Math.max(0, totalUploads - completedUploads);
  const fallbackEtaSeconds =
    totalUploads > 0
      ? Math.ceil(
          (remainingUploads / UPLOAD_BATCH_SIZE) *
            (MIN_BATCH_DURATION_MS / 1000),
        )
      : 0;
  const computedEtaSeconds =
    uploadStartedAt && completedUploads > 0
      ? Math.ceil(remainingUploads / (completedUploads / elapsedUploadSeconds))
      : fallbackEtaSeconds;
  const etaSeconds = uploading ? Math.max(0, computedEtaSeconds) : 0;

  useEffect(() => {
    if (!uploading || !uploadStartedAt) return;

    const interval = setInterval(() => {
      setUploadNow(Date.now());
    }, 500);

    return () => clearInterval(interval);
  }, [uploading, uploadStartedAt]);

  useEffect(() => {
    if (!uploading) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Cross-browser pattern to trigger native refresh/close warning dialog.
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [uploading]);

  function confirmNavigationDuringUpload() {
    if (!uploading) return true;
    return window.confirm(
      "Uploads are still in progress. If you leave, unfinished uploads may fail. Continue?",
    );
  }

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
    setUploadStartedAt(Date.now());
    setUploadNow(Date.now());
    setUploadDialogOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = "";

    for (let i = 0; i < files.length; i += UPLOAD_BATCH_SIZE) {
      const batch = files.slice(i, i + UPLOAD_BATCH_SIZE);
      const batchStartedAt = Date.now();

      await Promise.all(batch.map(uploadOne));

      const elapsedMs = Date.now() - batchStartedAt;
      const hasNextBatch = i + UPLOAD_BATCH_SIZE < files.length;
      if (hasNextBatch && elapsedMs < MIN_BATCH_DURATION_MS) {
        await sleep(MIN_BATCH_DURATION_MS - elapsedMs);
      }
    }

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
    setUploadStartedAt(null);
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

      <Dialog
        open={uploadDialogOpen}
        onOpenChange={(open) => {
          if (uploading && !open) return;
          setUploadDialogOpen(open);
        }}
      >
        <DialogContent
          className="max-w-md"
          showCloseButton={!uploading}
          onInteractOutside={(e) => uploading && e.preventDefault()}
          onEscapeKeyDown={(e) => uploading && e.preventDefault()}
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
          {totalUploads > 0 && (
            <div className="mt-1 space-y-1.5">
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span>
                  {completedUploads}/{totalUploads} files
                  {failedUploads > 0 ? ` (${failedUploads} failed)` : ""}
                </span>
                <span>
                  {uploadProgressPercent}%
                  {uploading ? ` · ETA ${formatDuration(etaSeconds)}` : ""}
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgressPercent}
                aria-label="Overall upload progress"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${uploadProgressPercent}%` }}
                />
              </div>
            </div>
          )}
          <div className="mt-2 max-h-72 overflow-y-auto pr-1">
            <ul className="space-y-2">
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
          </div>
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

      <Dialog
        open={renameFolderDialogOpen}
        onOpenChange={(open) => {
          setRenameFolderDialogOpen(open);
          if (!open) {
            setRenameFolderId("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRenameFolder}>
            <Input
              autoFocus
              placeholder="Folder name"
              value={renameFolderName}
              onChange={(e) => setRenameFolderName(e.target.value)}
            />
            <DialogFooter className="mt-4">
              <Button
                type="submit"
                disabled={!renameFolderName.trim() || renameFolder.isPending}
              >
                {renameFolder.isPending && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Rename
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
                    <div className="flex items-center gap-1.5">
                      <BreadcrumbPage className="font-bold text-(--sea-ink) text-2xl leading-tight sm:text-3xl sm:leading-normal">
                        {folder.name}
                      </BreadcrumbPage>
                      {folder.id &&
                        folder.canEdit !== false &&
                        folder.name !== MEMORA_ROOT_NAME && (
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-(--sea-ink)/80 transition hover:bg-black/5 hover:text-(--sea-ink)"
                            onClick={() =>
                              handleStartRenameFolder(folder.id, folder.name)
                            }
                            aria-label={`Rename ${folder.name}`}
                          >
                            <Edit3 className="size-4" />
                          </button>
                        )}
                    </div>
                  ) : (
                    <BreadcrumbLink
                      className="cursor-pointer font-bold text-2xl leading-tight sm:text-3xl sm:leading-normal"
                      onClick={() => {
                        if (!confirmNavigationDuringUpload()) return;
                        const newStack = folderStack.slice(0, stackIdx + 1);
                        setFolderStack(newStack);
                        const top = newStack[newStack.length - 1];
                        const topIsHome = top.id === preferences?.homeFolderId;
                        if (top.id && !topIsHome) {
                          navigate({
                            to: "/",
                            search: {
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

      <div className="mt-6 grid grid-cols-1 gap-4 [grid-template-areas:'content''media''actions'] lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-x-8 lg:[grid-template-areas:'content_actions''media_actions']">
        <div className="min-w-0 [grid-area:media]">
          {!isFoldersDataPending && (
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

        <aside className="mx-auto grid h-full w-full max-w-120 grid-cols-2 gap-2 pb-2 [grid-area:actions] lg:sticky lg:top-20 lg:flex lg:flex-col lg:gap-2 lg:self-start">
          <Button
            variant="outline"
            size="sm"
            className="w-full min-w-0 justify-start gap-1 px-2 lg:gap-1.5 lg:px-3"
            tooltip="Reload folders and media in the current folder."
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
              tooltip="Create and copy a share link for this folder."
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
              disabled={
                setHomeFolderPreference.isPending || isCurrentFolderHome
              }
              tooltip="Set this folder as your default landing folder."
              onClick={() => {
                if (isCurrentFolderHome) return;
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

        {folderSections.length > 0 && (
          <div className="mt-2 space-y-6 [grid-area:content] lg:mt-6">
            {folderSections.map((group) => (
              <section key={group.key} className="space-y-2">
                {group.heading && (
                  <h2 className="font-semibold text-(--sea-ink) text-sm uppercase tracking-wide">
                    {group.heading}
                  </h2>
                )}
                <div className="grid grid-cols-3 gap-4 md:grid-cols-4 lg:grid-cols-5">
                  {group.folders.map((f) => {
                    const createdAt = f.resolvedCreationTime;
                    const monthLabel =
                      createdAt && !Number.isNaN(createdAt.getTime())
                        ? monthFormatter.format(createdAt)
                        : null;
                    const thumbnailFileId = f.metadata?.thumbnailFileId;

                    return (
                      <button
                        key={f.shortcutId ?? f.id}
                        type="button"
                        className="relative aspect-square w-full cursor-pointer overflow-hidden rounded-xl border border-(--line) bg-(--surface) hover:opacity-90"
                        onClick={() =>
                          openFolder(f.id ?? "", f.name ?? "", f.canEdit)
                        }
                      >
                        {monthLabel && (
                          <div className="absolute top-1 left-1 z-10 rounded-full bg-black/65 px-2 py-0.5 font-medium text-[10px] text-white">
                            {monthLabel}
                          </div>
                        )}
                        {f.isShortcut && (
                          <div className="absolute top-1 right-1 z-10 rounded-lg bg-black/50 p-1 text-white">
                            <Link className="size-3.5" />
                          </div>
                        )}
                        {thumbnailFileId &&
                        folderThumbnailLinks?.[thumbnailFileId] ? (
                          <ThumbnailImage
                            thumbnailLink={
                              folderThumbnailLinks[thumbnailFileId]!
                            }
                            name={f.name ?? ""}
                            mimeType="image/"
                            fitType="cover"
                            maxWidth={200}
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Folder className="size-16 text-(--lagoon-deep)" />
                          </div>
                        )}
                        <div className="absolute right-0 bottom-0 left-0 bg-black/40 px-2 py-1.5">
                          <div className="flex items-start justify-between gap-1.5">
                            <span className="line-clamp-2 block h-8 min-w-0 flex-1 font-medium text-white text-xs leading-4">
                              {f.name}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
