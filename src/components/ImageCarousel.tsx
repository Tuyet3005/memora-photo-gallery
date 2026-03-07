import type { inferRouterOutputs } from "@trpc/server";
import { Video } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "#/components/ui/carousel";
import { Skeleton } from "#/components/ui/skeleton";
import type { driveRouter } from "#/integrations/trpc/routers/drive";
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
}: {
  thumbnailLink: string;
  name: string;
  mimeType: string;
  fitType?: "contain" | "cover";
  maxWidth?: number;
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
          className={`select-none absolute inset-0 h-full w-full ${objectFitClass} object-center transition-opacity duration-300 blur-xs ${lowLoaded ? "opacity-100" : "opacity-0"}`}
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
          className={`select-none h-full w-full ${objectFitClass} object-center ${fullLoaded ? "opacity-100" : "opacity-0"}`}
          referrerPolicy="no-referrer"
          onLoad={() => setTimeout(() => setFullLoaded(true), 300)}
        />
      )}
    </div>
  );
}

export function ImageCarousel({
  files,
}: {
  files: inferRouterOutputs<typeof driveRouter>["listFiles"];
}) {
  const photoFiles = files.filter((file) =>
    file.mimeType?.startsWith("image/"),
  );

  const [api, setApi] = useState<CarouselApi>();
  const [thumbnailApi, setThumbnailApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!thumbnailApi || !api) return;

    setCurrentIndex(api.selectedScrollSnap());

    api.on("select", () => {
      setCurrentIndex(api.selectedScrollSnap());
      thumbnailApi.scrollTo(api.selectedScrollSnap());
    });
  }, [thumbnailApi, api]);

  if (photoFiles.length === 0) {
    return null;
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Intended for keyboard navigation
    <div
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
          {photoFiles
            .filter((file) => file.thumbnailLink)
            .map((file, i) => (
              <CarouselItem key={file.id}>
                {Math.abs(i - currentIndex) <= 3 && (
                  <ThumbnailImage
                    thumbnailLink={file.thumbnailLink!}
                    name={file.name ?? ""}
                    mimeType={file.mimeType ?? ""}
                  />
                )}
              </CarouselItem>
            ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
      <Carousel
        setApi={setThumbnailApi}
        opts={{ containScroll: false, dragFree: true }}
      >
        <CarouselContent className="h-24 mt-4 py-1">
          {photoFiles
            .filter((file) => file.thumbnailLink)
            .map((file, i) => (
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
                />
              </CarouselItem>
            ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}
