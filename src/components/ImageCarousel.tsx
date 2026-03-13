import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2, RotateCcw, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "#/components/ui/carousel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { useTRPC } from "#/integrations/trpc/react";
import { cn } from "#/lib/utils";
import { ThumbnailImage } from "./ThumbnailImage";

const CAROUSEL_THUMBNAIL_SIZE = 100;

function DriveVideoPlayer({ fileId }: { fileId: string }) {
  return (
    <div className="relative size-full">
      <iframe
        src={`https://drive.google.com/file/d/${fileId}/preview`}
        className="size-full rounded-md border-0"
        allow="autoplay"
        title="Video player"
      />
    </div>
  );
}

export function ImageCarousel({
  folderId,
  shareId,
  uploadCount = 0,
  currentThumbnailFileId,
  onThumbnailSet,
  readOnly = false,
  ancestorFolders = [],
}: {
  folderId?: string;
  shareId?: string;
  uploadCount?: number;
  currentThumbnailFileId?: string | null;
  onThumbnailSet?: (
    fileId: string,
    targetFolderId: string,
  ) => Promise<void> | void;
  readOnly?: boolean;
  ancestorFolders?: {
    id: string;
    name: string;
    thumbnailFileId?: string | null;
  }[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const {
    data: authenticatedPages,
    fetchNextPage: fetchNextAuthenticated,
    hasNextPage: hasNextAuthenticated,
  } = useInfiniteQuery({
    ...trpc.drive.listMedia.infiniteQueryOptions(
      { folderId },
      { getNextPageParam: (page) => page.nextCursor ?? undefined },
    ),
    enabled: !shareId,
    refetchOnWindowFocus: false,
  });

  const {
    data: sharedPages,
    fetchNextPage: fetchNextShared,
    hasNextPage: hasNextShared,
  } = useInfiniteQuery({
    ...trpc.share.listSharedMedia.infiniteQueryOptions(
      { shareId: shareId ?? "" },
      {
        getNextPageParam: (page) =>
          page ? (page.nextCursor ?? undefined) : undefined,
      },
    ),
    enabled: !!shareId,
    refetchOnWindowFocus: false,
  });

  const mediaPages = shareId ? sharedPages : authenticatedPages;
  const fetchNextPage = shareId ? fetchNextShared : fetchNextAuthenticated;
  const hasNextPage = shareId ? hasNextShared : hasNextAuthenticated;

  const files = mediaPages?.pages.flatMap((p) => p.files) ?? [];
  const visibleFiles = files.filter((f) => f.thumbnailLink);

  const [api, setApi] = useState<CarouselApi>();
  const [thumbnailApi, setThumbnailApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Map from fileId -> cumulative optimistic rotation in degrees
  const [optimisticRotations, setOptimisticRotations] = useState<
    Record<string, number>
  >({});

  // Clear optimistic rotations when navigating to a different folder or after upload
  // biome-ignore lint/correctness/useExhaustiveDependencies: folderId and uploadCount are the triggers
  useEffect(() => {
    setOptimisticRotations({});
  }, [folderId, uploadCount]);

  // Auto-focus the carousel when files become available (covers both folder navigation and initial load/refresh)
  const hasFocusedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: folderId reset intentional
  useEffect(() => {
    hasFocusedRef.current = false;
  }, [folderId]);
  useEffect(() => {
    if (visibleFiles.length > 0 && !hasFocusedRef.current) {
      hasFocusedRef.current = true;
      containerRef.current?.focus();
    }
  }, [visibleFiles.length]);

  // Map from fileId -> whether a request is in-flight
  const [inFlight, setInFlight] = useState<Record<string, boolean>>({});

  // Map from folderId -> whether thumbnail set is in-flight
  const [thumbnailInFlight, setThumbnailInFlight] = useState<
    Record<string, boolean>
  >({});

  function handleSetThumbnail(fileId: string, targetFolderId: string) {
    if (thumbnailInFlight[targetFolderId] || !onThumbnailSet) return;
    setThumbnailInFlight((prev) => ({ ...prev, [targetFolderId]: true }));
    Promise.resolve(onThumbnailSet(fileId, targetFolderId)).finally(() => {
      setThumbnailInFlight((prev) => ({ ...prev, [targetFolderId]: false }));
    });
  }

  const rotateImage = useMutation(trpc.mediaEdit.rotateImage.mutationOptions());

  // Per-file debounce state: pending click count + timer
  const pendingRef = useRef<
    Record<
      string,
      { clicks: number; timer: ReturnType<typeof setTimeout> | null }
    >
  >({});

  useEffect(() => {
    if (!thumbnailApi || !api) return;

    setCurrentIndex(api.selectedScrollSnap());

    api.on("select", () => {
      setCurrentIndex(api.selectedScrollSnap());
      thumbnailApi.scrollTo(api.selectedScrollSnap());
    });
  }, [thumbnailApi, api]);

  // Load next page when carousel approaches the end
  useEffect(() => {
    if (!api || !hasNextPage) return;

    const onSelect = () => {
      const total = api.scrollSnapList().length;
      if (api.selectedScrollSnap() >= total - 20) {
        fetchNextPage();
      }
    };

    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api, hasNextPage, fetchNextPage]);

  if (visibleFiles.length === 0) {
    return null;
  }

  function handleRotateLeft(fileId: string) {
    if (inFlight[fileId]) return;

    const state = pendingRef.current[fileId] ?? { clicks: 0, timer: null };

    // Accumulate click and optimistically rotate
    state.clicks += 1;
    setOptimisticRotations((prev) => ({
      ...prev,
      [fileId]: (prev[fileId] ?? 0) - 90,
    }));

    // Reset debounce timer
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      const totalClicks = pendingRef.current[fileId]?.clicks ?? 0;
      pendingRef.current[fileId] = { clicks: 0, timer: null };

      const degrees = (totalClicks * 90) % 360;
      if (degrees === 0) return;

      setInFlight((prev) => ({ ...prev, [fileId]: true }));

      rotateImage.mutate(
        { fileId, degrees },
        {
          onSuccess: () => {
            setOptimisticRotations((prev) => ({ ...prev, [fileId]: 0 }));
          },
          onSettled: () => {
            setInFlight((prev) => ({ ...prev, [fileId]: false }));
            queryClient.invalidateQueries({
              queryKey: trpc.drive.listMedia.infiniteQueryKey({ folderId }),
              refetchType: "none",
            });
          },
          onError: () => {
            // Revert all pending optimistic rotations
            setOptimisticRotations((prev) => ({
              ...prev,
              [fileId]: ((prev[fileId] ?? 0) + degrees) % 360,
            }));
          },
        },
      );
    }, 500);

    pendingRef.current[fileId] = state;
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Intended for keyboard navigation
    <div
      ref={containerRef}
      className="w-full outline-none"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Required to trigger keyup
      tabIndex={0}
      onKeyUp={(e) => {
        if (e.key === "ArrowLeft") api?.scrollPrev();
        else if (e.key === "ArrowRight") api?.scrollNext();
      }}
    >
      <Carousel
        setApi={setApi}
        opts={{ duration: 20 }}
        className="items-stretch gap-2"
      >
        <CarouselPrevious className="hidden h-[60vh] w-10 rounded-md shadow sm:inline-flex" />
        <CarouselContent className="h-[52vh] min-w-0 flex-1 sm:h-[60vh]">
          {visibleFiles.map((file, i) => (
            <CarouselItem key={file.id} className="relative">
              {Math.abs(i - currentIndex) <= 3 &&
                (file.mimeType?.startsWith("video/") && i === currentIndex ? (
                  <DriveVideoPlayer fileId={file.id!} />
                ) : (
                  <ThumbnailImage
                    thumbnailLink={file.thumbnailLink!}
                    name={file.name ?? ""}
                    mimeType={file.mimeType ?? ""}
                    rotateDeg={optimisticRotations[file.id!] ?? 0}
                    rounded
                    showBlurBackdrop
                    blurBackdropSize={CAROUSEL_THUMBNAIL_SIZE}
                  />
                ))}
              {i === currentIndex && file.id && !readOnly && (
                <div className="absolute top-2 right-2 z-20 flex gap-1">
                  {folderId &&
                    onThumbnailSet &&
                    file.thumbnailLink &&
                    ancestorFolders.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="bg-black/50 text-white hover:bg-black/70 hover:text-white"
                            aria-label="Set as folder thumbnail"
                          >
                            <Star
                              className="size-5"
                              fill={
                                currentThumbnailFileId === file.id
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {ancestorFolders.map((folder) => (
                            <DropdownMenuItem
                              key={folder.id}
                              disabled={!!thumbnailInFlight[folder.id]}
                              onClick={() =>
                                handleSetThumbnail(file.id!, folder.id)
                              }
                              className="flex items-center gap-2"
                            >
                              {thumbnailInFlight[folder.id] ? (
                                <Loader2 className="size-4 shrink-0 animate-spin" />
                              ) : (
                                <Star
                                  className="size-4 shrink-0"
                                  fill={
                                    folder.thumbnailFileId === file.id
                                      ? "currentColor"
                                      : "none"
                                  }
                                />
                              )}
                              <span>{folder.name}</span>
                              {folder.id === folderId && (
                                <span className="ml-auto text-muted-foreground text-xs">
                                  current
                                </span>
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  {!file.mimeType?.startsWith("video/") && (
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={!!inFlight[file.id]}
                      className="bg-black/50 text-white hover:bg-black/70 hover:text-white disabled:opacity-50"
                      onClick={() => handleRotateLeft(file.id!)}
                      aria-label="Rotate left"
                    >
                      {inFlight[file.id] ? (
                        <Loader2 className="direction-[reverse] size-5 animate-spin" />
                      ) : (
                        <RotateCcw className="size-5" />
                      )}
                    </Button>
                  )}
                </div>
              )}
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselNext className="hidden h-[60vh] w-10 rounded-md shadow sm:inline-flex" />
      </Carousel>
      <Carousel
        setApi={setThumbnailApi}
        opts={{ containScroll: false, dragFree: true }}
      >
        <CarouselContent className="mt-3 h-24 px-1 py-1 sm:mt-4 sm:h-24">
          {visibleFiles.map((file, i) => (
            <CarouselItem
              key={file.id}
              className={cn(
                "h-full w-20 shrink-0 basis-auto cursor-pointer rounded-md p-1 transition-opacity hover:opacity-100",
                currentIndex === i
                  ? "opacity-100 outline-(--lagoon-deep) outline-2"
                  : "opacity-80",
              )}
              onClick={() => {
                api?.scrollTo(i);
              }}
            >
              <ThumbnailImage
                thumbnailLink={file.thumbnailLink!}
                name={file.name ?? ""}
                mimeType={file.mimeType ?? ""}
                fitType="cover"
                maxWidth={CAROUSEL_THUMBNAIL_SIZE}
                rotateDeg={optimisticRotations[file.id!] ?? 0}
              />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}
