import { Video } from "lucide-react";
import { useEffect, useState } from "react";
import { Skeleton } from "#/components/ui/skeleton";
import { cn } from "#/lib/utils";

// Drive's thumbnailLink ends with =s<size>; replace that to resize.
export function lh3Src(thumbnailLink: string, size?: number) {
  return thumbnailLink.replace(/=s\d+$/, size ? `=s${size}` : "");
}

export function ThumbnailImage({
  thumbnailLink,
  name,
  mimeType,
  fitType = "contain",
  maxWidth,
  rotateDeg = 0,
  rounded = false,
  showBlurBackdrop = false,
  blurBackdropSize,
  lowResSize = 10,
  lowResBlurClassName = "blur-xs",
  fullImageClassName,
}: {
  thumbnailLink: string;
  name: string;
  mimeType: string;
  fitType?: "contain" | "cover";
  maxWidth: number;
  rotateDeg?: number;
  rounded?: boolean;
  showBlurBackdrop?: boolean;
  blurBackdropSize?: number;
  lowResSize?: number;
  lowResBlurClassName?: string;
  fullImageClassName?: string;
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
    <div className="relative isolate size-full overflow-hidden rounded-md">
      {showBlurBackdrop && (
        <img
          src={lh3Src(thumbnailLink, blurBackdropSize ?? maxWidth)}
          alt=""
          aria-hidden="true"
          className={cn(
            "absolute inset-0 z-0 size-full scale-110 object-cover opacity-50 blur-2xl",
            rounded && "rounded-lg",
          )}
          referrerPolicy="no-referrer"
        />
      )}
      {mimeType.startsWith("video/") && (
        <div className="absolute top-1 right-1 z-10 rounded-sm bg-black/70 p-0.5">
          <Video className="size-4 text-white" />
        </div>
      )}
      {!lowLoaded && !fullLoaded && (
        <Skeleton className="absolute inset-0 z-20 size-full" />
      )}
      {!fullLoaded && (
        <img
          src={lh3Src(thumbnailLink, lowResSize)}
          alt={name}
          style={rotateStyle}
          className={cn(
            "absolute inset-0 z-10 size-full select-none",
            rounded && "rounded-lg",
            objectFitClass,
            "object-center duration-300",
            lowResBlurClassName,
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
            "absolute inset-0 z-10 size-full select-none",
            rounded && "rounded-lg",
            objectFitClass,
            "object-center",
            fullImageClassName,
            fullLoaded ? "opacity-100" : "opacity-0",
          )}
          referrerPolicy="no-referrer"
          onLoad={() => setTimeout(() => setFullLoaded(true), 300)}
        />
      )}
    </div>
  );
}
