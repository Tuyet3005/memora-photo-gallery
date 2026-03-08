import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2, RotateCcw, Video } from "lucide-react";
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
import { Skeleton } from "#/components/ui/skeleton";
import { useTRPC } from "#/integrations/trpc/react";
import { cn } from "#/lib/utils";

// Drive's thumbnailLink ends with =s<size>; replace that to resize.
function lh3Src(thumbnailLink: string, size?: number) {
  return thumbnailLink.replace(/=s\d+$/, size ? `=s${size}` : "");
}

function ThumbnailImage({
  thumbnailLink,
  name,
  mimeType,
  fitType = "contain",
  maxWidth,
  rotateDeg = 0,
  rounded = false,
}: {
  thumbnailLink: string;
  name: string;
  mimeType: string;
  fitType?: "contain" | "cover";
  maxWidth?: number;
  rotateDeg?: number;
  rounded?: boolean;
}) {
  const [fullStarted, setFullStarted] = useState(false);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [lowLoaded, setLowLoaded] = useState(false);

  const [fullStartTimeout, setFullStartTimeout] = useState<NodeJS.Timeout>();

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once only
  useEffect(() => {
    setFullStartTimeout(setTimeout(() => setFullStarted(true), 100));
    return () => {
      if (fullStartTimeout) {
        clearTimeout(fullStartTimeout);
      }
    };
  }, []);

  const objectFitClass =
    fitType === "cover" ? "object-cover" : "object-contain";

  const rotateStyle =
    rotateDeg !== 0
      ? {
          transform: `rotate(${rotateDeg}deg)`,
          transition: "transform 0.3s ease",
        }
      : { transition: "transform 0.3s ease" };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md">
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
          style={rotateStyle}
          className={cn(
            "select-none absolute inset-0 h-full mx-auto",
            rounded && "rounded-lg",
            objectFitClass,
            "object-center duration-300 blur-xs",
            lowLoaded ? "opacity-100" : "opacity-0",
          )}
          referrerPolicy="no-referrer"
          onLoad={() => {
            setLowLoaded(true);
            setFullStarted(true);
            clearTimeout(fullStartTimeout!);
          }}
        />
      )}
      {fullStarted && (
        <img
          src={lh3Src(thumbnailLink, maxWidth)}
          alt={name}
          style={rotateStyle}
          className={cn(
            "select-none h-full mx-auto",
            rounded && "rounded-lg",
            objectFitClass,
            "object-center",
            fullLoaded ? "opacity-100" : "opacity-0",
          )}
          referrerPolicy="no-referrer"
          onLoad={() => setTimeout(() => setFullLoaded(true), 300)}
        />
      )}
    </div>
  );
}

export function ImageCarousel({
  folderId,
  uploadCount = 0,
}: {
  folderId?: string;
  uploadCount?: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const {
    data: mediaPages,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery(
    trpc.drive.listMedia.infiniteQueryOptions(
      { folderId },
      { getNextPageParam: (page) => page.nextCursor ?? undefined },
    ),
  );

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

  // Auto-focus the carousel when a new folder is selected and files are available
  // biome-ignore lint/correctness/useExhaustiveDependencies: folderId is the trigger
  useEffect(() => {
    if (visibleFiles.length > 0) {
      containerRef.current?.focus();
    }
  }, [folderId]);

  // Map from fileId -> whether a request is in-flight
  const [inFlight, setInFlight] = useState<Record<string, boolean>>({});

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
      className="w-full"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Required to trigger keyup
      tabIndex={0}
      onKeyUp={(e) => {
        if (e.key === "ArrowLeft") api?.scrollPrev();
        else if (e.key === "ArrowRight") api?.scrollNext();
      }}
    >
      <Carousel setApi={setApi} opts={{ duration: 20 }}>
        <CarouselContent className="h-[60vh]">
          {visibleFiles.map((file, i) => (
            <CarouselItem key={file.id} className="relative">
              {Math.abs(i - currentIndex) <= 3 && (
                <ThumbnailImage
                  thumbnailLink={file.thumbnailLink!}
                  name={file.name ?? ""}
                  mimeType={file.mimeType ?? ""}
                  rotateDeg={optimisticRotations[file.id!] ?? 0}
                  rounded
                />
              )}
              {i === currentIndex &&
                file.id &&
                !file.mimeType?.startsWith("video/") && (
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={!!inFlight[file.id]}
                    className="absolute top-2 right-2 z-20 bg-black/50 text-white hover:bg-black/70 hover:text-white disabled:opacity-50"
                    onClick={() => handleRotateLeft(file.id!)}
                    aria-label="Rotate left"
                  >
                    {inFlight[file.id] ? (
                      <Loader2 className="size-5 animate-spin direction-[reverse]" />
                    ) : (
                      <RotateCcw className="size-5" />
                    )}
                  </Button>
                )}
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="h-full w-10 shadow rounded-md" />
        <CarouselNext className="h-full w-10 shadow rounded-md" />
      </Carousel>
      <Carousel
        setApi={setThumbnailApi}
        opts={{ containScroll: false, dragFree: true }}
      >
        <CarouselContent className="h-24 mt-4 py-1">
          {visibleFiles.map((file, i) => (
            <CarouselItem
              key={file.id}
              className={cn(
                "p-2 h-full basis-1/12 cursor-pointer rounded-md transition-opacity hover:opacity-100",
                currentIndex === i
                  ? "opacity-100 outline-2 outline-(--lagoon-deep)"
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
                maxWidth={100}
                rotateDeg={optimisticRotations[file.id!] ?? 0}
              />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}
