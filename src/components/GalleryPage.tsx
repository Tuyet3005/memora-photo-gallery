import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Folder,
  Home,
  Loader2,
  Upload,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import { useTRPC } from "#/integrations/trpc/react";
import { authClient } from "#/lib/auth-client";
import { ImageCarousel } from "./ImageCarousel";

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

const YOUR_GALLERY = { id: "", name: "Your gallery" };

export function GalleryPage() {
  const trpc = useTRPC();
  const { data: session } = authClient.useSession();
  // folderStack always has YOUR_GALLERY as index 0
  const [folderStack, setFolderStack] = useState<
    { id: string; name: string }[]
  >([YOUR_GALLERY]);
  const [folderStackInitialized, setFolderStackInitialized] = useState(false);

  const currentFolder = folderStack[folderStack.length - 1];
  // Pass undefined for root (empty id = Your gallery)
  const currentFolderId = currentFolder.id || undefined;

  const {
    data: foldersData,
    isPending,
    isFetching,
  } = useQuery({
    ...trpc.drive.listFolders.queryOptions({ folderId: currentFolderId }),
    enabled: folderStackInitialized,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });

  // Hide content when navigating to a new folder (no cached data yet) or
  // when the folder just changed and is actively fetching fresh data.
  const [fetchingFolderId, setFetchingFolderId] = useState(currentFolderId);
  const folderChanged = fetchingFolderId !== currentFolderId;
  useEffect(() => {
    if (!isFetching) setFetchingFolderId(currentFolderId);
  }, [isFetching, currentFolderId]);

  const folders =
    isPending || (folderChanged && isFetching)
      ? undefined
      : (foldersData ?? []);

  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadEntries, setUploadEntries] = useState<FileUploadEntry[]>([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
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

  // Initialize folderStack from home folder on first load
  useEffect(() => {
    if (folderStackInitialized) return;
    if (!preferences) return;
    if (preferences.homeFolderId && !homeFolderPath) return; // wait for path
    setFolderStackInitialized(true);
    if (homeFolderPath) {
      setFolderStack([YOUR_GALLERY, ...homeFolderPath]);
    }
  }, [preferences, homeFolderPath, folderStackInitialized]);

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
                        onClick={() =>
                          setFolderStack((prev) => prev.slice(0, stackIdx + 1))
                        }
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
        </div>
      </div>

      <div className="mt-6">
        <ImageCarousel folderId={currentFolderId} uploadCount={uploadCount} />
      </div>

      {folders === undefined && (
        <div className="flex justify-center py-12">
          <img src="/loading.gif" alt="Loading…" className="w-[60%] max-w-52" />
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {folders?.map((f) => (
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
        ))}
      </div>
    </main>
  );
}
