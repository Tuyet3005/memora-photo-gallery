import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Link,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { useTRPC } from "#/integrations/trpc/react";
import { groupBy } from "#/lib/utils";
import { ThumbnailImage } from "./ThumbnailImage";

export interface FoldersListItem {
  id?: string | null;
  shortcutId?: string | null;
  name?: string | null;
  canEdit?: boolean;
  resolvedCreationTime?: Date | null;
  isShortcut?: boolean | null;
  metadata?: {
    thumbnailFileId?: string | null;
  } | null;
}

function formatMonthLabel(date: Date) {
  return String(date.getMonth() + 1).padStart(2, "0");
}

export function FoldersList({
  folderId,
  enabled,
  refreshToken,
  refreshFolderDatesToken,
  onRefreshFolderDatesStateChange,
  openFolder,
}: {
  folderId?: string;
  enabled: boolean;
  refreshToken: number;
  refreshFolderDatesToken: number;
  onRefreshFolderDatesStateChange?: (isRefreshing: boolean) => void;
  openFolder: (id: string, name: string, canEdit?: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: foldersData, isLoading: isFoldersDataPending } = useQuery({
    ...trpc.drive.listFolders.queryOptions({ folderId }),
    enabled,
    refetchOnWindowFocus: false,
  });
  const fetchFolderCreationTime = useMutation(
    trpc.drive.fetchFolderCreationTime.mutationOptions(),
  );
  const [fetchedCreationTimes, setFetchedCreationTimes] = useState<
    Record<string, Date | null>
  >({});
  const [collapsedYearKeys, setCollapsedYearKeys] = useState<Set<string>>(
    new Set(),
  );
  const [inFlightCreationTimeFolderIds, setInFlightCreationTimeFolderIds] =
    useState<Set<string>>(new Set());
  const [isRefreshingFolderDates, setIsRefreshingFolderDates] =
    useState<boolean>(false);
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
      .map(([year, groupedFolders]) => ({
        year,
        folders: groupedFolders.sort(
          (a, b) =>
            (b.resolvedCreationTime?.getTime() ?? 0) -
            (a.resolvedCreationTime?.getTime() ?? 0),
        ),
      }));

    const sortedUngrouped = ungrouped.sort(
      (a, b) =>
        (b.metadata?.creationTime?.getTime() ?? 0) -
        (a.metadata?.creationTime?.getTime() ?? 0),
    );

    return { foldersByCreationYear: byYear, ungroupedFolders: sortedUngrouped };
  }, [folderList]);

  const folderSections = useMemo(() => {
    const sections: Array<{
      key: string;
      heading: string | null;
      folders: typeof folderList;
    }> = foldersByCreationYear.map((group) => ({
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

  const thumbnailFileIds = (folders ?? [])
    .map((folder) => folder.metadata?.thumbnailFileId)
    .filter(Boolean) as string[];
  const { data: folderThumbnailLinks } = useQuery({
    ...trpc.drive.getFolderThumbnails.queryOptions({
      fileIds: thumbnailFileIds,
    }),
    enabled: thumbnailFileIds.length > 0,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    onRefreshFolderDatesStateChange?.(isRefreshingFolderDates);
  }, [isRefreshingFolderDates, onRefreshFolderDatesStateChange]);

  useEffect(() => {
    if (refreshToken === 0) return;

    queryClient.resetQueries(trpc.drive.listFolders.queryOptions({ folderId }));
  }, [folderId, queryClient, refreshToken, trpc]);

  useEffect(() => {
    if (pendingCreationTimeFolderIds.length === 0) {
      if (isRefreshingFolderDates && inFlightCreationTimeFolderIds.size === 0) {
        toast.success("Folder dates updated");
        setIsRefreshingFolderDates(false);
      }
      return;
    }
    if (fetchFolderCreationTime.isPending) return;

    const batchFolderIds = pendingCreationTimeFolderIds.slice(0, 20);
    if (batchFolderIds.length === 0) return;

    setInFlightCreationTimeFolderIds((prev) => {
      const next = new Set(prev);
      for (let i = 0; i < batchFolderIds.length; i++) {
        next.add(batchFolderIds[i]);
      }
      return next;
    });

    fetchFolderCreationTime
      .mutateAsync({ folderIds: batchFolderIds })
      .then((result) => {
        const completedBatch = Object.fromEntries(
          batchFolderIds.map((id) => [id, result[id] ?? null]),
        ) as Record<string, Date | null>;
        setFetchedCreationTimes((prev) => ({ ...prev, ...completedBatch }));
      })
      .catch(() => {
        setFetchedCreationTimes((prev) => ({
          ...prev,
          ...Object.fromEntries(batchFolderIds.map((id) => [id, null])),
        }));
      })
      .finally(() => {
        setInFlightCreationTimeFolderIds((prev) => {
          const next = new Set(prev);
          for (let i = 0; i < batchFolderIds.length; i++) {
            next.delete(batchFolderIds[i]);
          }
          return next;
        });
      });
  }, [
    pendingCreationTimeFolderIds,
    fetchFolderCreationTime,
    inFlightCreationTimeFolderIds,
    isRefreshingFolderDates,
  ]);

  useEffect(() => {
    if (refreshFolderDatesToken === 0 || !folders) return;

    const allFolderIds = folders
      .filter((folder) => folder.id)
      .map((folder) => folder.id);
    if (allFolderIds.length === 0) return;

    setIsRefreshingFolderDates(true);
    setFetchedCreationTimes({});
  }, [folders, refreshFolderDatesToken]);

  if (folders === undefined) {
    return (
      <div className="flex justify-center py-12 [grid-area:content]">
        <img src="/loading.gif" alt="Loading..." className="w-[60%] max-w-52" />
      </div>
    );
  }

  if (folderSections.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-12 [grid-area:content] lg:mt-6">
      {folderSections.map((group) => {
        const isCollapsed = !!group.heading && collapsedYearKeys.has(group.key);

        return (
          <section key={group.key} className="space-y-2">
            {group.heading && (
              <div className="flex items-center gap-2">
                <h2 className="bg-linear-to-r from-rose-300 via-sky-300 to-violet-300 bg-clip-text font-black text-3xl text-transparent tracking-[0.04em] drop-shadow-[0_2px_0_rgba(255,255,255,0.7)] sm:text-4xl">
                  {group.heading}
                </h2>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 rounded-full text-(--sea-ink-soft) hover:bg-white/60"
                  onClick={() => {
                    setCollapsedYearKeys((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.key)) {
                        next.delete(group.key);
                      } else {
                        next.add(group.key);
                      }
                      return next;
                    });
                  }}
                  aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.heading}`}
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                </Button>
              </div>
            )}
            {!isCollapsed && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-5">
                {group.folders.map((folder) => {
                  const createdAt = folder.resolvedCreationTime;
                  const monthLabel =
                    createdAt && !Number.isNaN(createdAt.getTime())
                      ? formatMonthLabel(createdAt)
                      : null;
                  const showMonthBadgeSkeleton =
                    !monthLabel &&
                    !!folder.id &&
                    inFlightCreationTimeFolderIds.has(folder.id);
                  const thumbnailFileId = folder.metadata?.thumbnailFileId;

                  return (
                    <button
                      key={folder.shortcutId ?? folder.id}
                      type="button"
                      className="group relative aspect-4/5 w-full cursor-pointer overflow-hidden rounded-[22px] border border-white/55 bg-(--surface-strong) shadow-[0_14px_34px_rgba(23,58,64,0.16)] transition-all duration-300 hover:-translate-y-1.5 hover:scale-[1.015] hover:shadow-[0_24px_42px_rgba(79,184,178,0.28)]"
                      onClick={() =>
                        openFolder(
                          folder.id ?? "",
                          folder.name ?? "",
                          folder.canEdit,
                        )
                      }
                    >
                      <div className="pointer-events-none absolute -top-12 -right-10 z-0 h-28 w-28 rounded-full bg-sky-200/35 blur-2xl transition-opacity duration-300 group-hover:opacity-95" />
                      <div className="pointer-events-none absolute -bottom-12 -left-10 z-0 h-28 w-28 rounded-full bg-emerald-200/30 blur-2xl transition-opacity duration-300 group-hover:opacity-95" />
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,rgba(255,255,255,0.25)_0%,rgba(255,255,255,0)_50%),radial-gradient(120%_90%_at_100%_100%,rgba(191,219,254,0.2)_0%,rgba(191,219,254,0)_55%)]" />
                      {monthLabel && (
                        <div className="absolute top-2 left-2 z-10 rounded-full border border-white/45 bg-black/55 px-2.5 py-0.5 font-semibold text-[11px] text-white backdrop-blur-md">
                          {monthLabel}
                        </div>
                      )}
                      {showMonthBadgeSkeleton && (
                        <div className="absolute top-2 left-2 z-10 rounded-full border border-white/30 bg-black/45 px-2 py-1 backdrop-blur-sm">
                          <div className="h-2.5 w-6 animate-pulse rounded-full bg-white/80" />
                        </div>
                      )}
                      {folder.isShortcut && (
                        <div className="absolute top-2 right-2 z-10 rounded-lg border border-white/30 bg-black/45 p-1 text-white backdrop-blur-sm">
                          <Link className="size-3.5" />
                        </div>
                      )}
                      {thumbnailFileId &&
                      folderThumbnailLinks?.[thumbnailFileId] ? (
                        <>
                          <ThumbnailImage
                            thumbnailLink={
                              folderThumbnailLinks[thumbnailFileId]!
                            }
                            name={folder.name ?? ""}
                            mimeType="image/"
                            fitType="cover"
                            maxWidth={200}
                          />
                          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/50 via-black/10 to-transparent transition-opacity duration-300 group-hover:opacity-90" />
                          <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/20 via-transparent to-transparent" />
                        </>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-emerald-50 via-sky-50 to-violet-100">
                          <div className="absolute -top-8 -right-6 h-20 w-20 rounded-full bg-sky-200/60 blur-xl" />
                          <div className="absolute -bottom-8 -left-6 h-20 w-20 rounded-full bg-emerald-200/60 blur-xl" />
                          <Folder className="relative z-10 size-16 text-(--lagoon-deep)" />
                          <Sparkles className="absolute top-4 right-4 z-10 size-4 text-sky-400/80" />
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/25 ring-inset" />
                      <div className="absolute right-0 bottom-0 left-0 h-[calc(2*1.2em+0.375rem)] border-black/10 border-t bg-white/95 px-3 py-0.75 backdrop-blur-md">
                        <div className="flex h-full items-center">
                          <span className="wrap-normal min-w-0 flex-1 overflow-hidden text-ellipsis font-medium text-(--sea-ink) text-[13px] leading-[1.2] tracking-[0.01em] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]">
                            {folder.name}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
