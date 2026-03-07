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
