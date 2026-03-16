import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Parse an EXIF date string like "2026:03:03 08:42:03" into a Date. */
export function parseExifDate(exif: string): Date {
  // Replace the first two colons (date separators) with dashes so Date can parse it
  return new Date(exif.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3"));
}

export function hasHoverSupport() {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia === "undefined"
  ) {
    return false;
  }
  return window.matchMedia("(hover: hover)").matches;
}

export function formatDuration(totalSeconds: number) {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function groupBy<T>(list: T[], func: (item: T) => string) {
  const grouped: Record<string, T[]> = {};

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const key = func(item);

    if (grouped[key]) {
      grouped[key].push(item);
    } else {
      grouped[key] = [item];
    }
  }

  return grouped;
}
