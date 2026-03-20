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

export function formatSizeProgress(uploadedBytes: number, totalBytes: number) {
  const oneMB = 1024 * 1024;
  const totalMB = totalBytes / oneMB;
  const uploadedMB = uploadedBytes / oneMB;

  if (totalMB > 1024) {
    return `${(uploadedMB / 1024).toFixed(1)}/${(totalMB / 1024).toFixed(1)} GB`;
  }

  return `${uploadedMB.toFixed(1)}/${totalMB.toFixed(1)} MB`;
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseResumableRangeHeader(rangeHeader: string | null): number | null {
  if (!rangeHeader) return null;
  const match = rangeHeader.match(/bytes=\d+-(\d+)$/);
  if (!match) return null;
  const end = Number(match[1]);
  return Number.isFinite(end) ? end + 1 : null;
}

async function readHttpErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body?.error?.message && typeof body.error.message === "string") {
      return body.error.message;
    }
    if (body?.error && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Fall back to text body for non-JSON responses.
  }

  const text = await response.text().catch(() => "");
  return text || `Upload failed (${response.status})`;
}

/** Uploads a file to a Google Drive resumable session URI in 4MB chunks. */
export async function uploadFileToResumableUri(
  _resumableUri: string,
  file: File,
  uploadId: string,
  onProgress?: (uploadedBytes: number) => void,
  chunkSize = 4 * 1024 * 1024,
): Promise<void> {
  const totalSize = file.size;

  if (totalSize < 1) {
    throw new Error("Empty files are not supported for resumable upload.");
  }

  let offset = 0;

  while (offset < totalSize) {
    const nextOffset = Math.min(offset + chunkSize, totalSize);
    const chunk = file.slice(offset, nextOffset);

    const response = await fetch(`/api/upload/${uploadId}`, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Content-Range": `bytes ${offset}-${nextOffset - 1}/${totalSize}`,
      },
      body: chunk,
    });

    if (response.status === 308) {
      const acknowledgedOffset = parseResumableRangeHeader(
        response.headers.get("Range"),
      );
      offset = acknowledgedOffset ?? nextOffset;
      onProgress?.(offset);
      continue;
    }

    if (!response.ok) {
      throw new Error(await readHttpErrorMessage(response));
    }

    // A 2xx response indicates Drive accepted the final chunk.
    offset = totalSize;
    onProgress?.(totalSize);
  }
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

// Date/time components for filename parsing patterns
const DATE_TIME_PATTERNS_COMPONENTS = {
  year: "(?<year>\\d{4})",
  month: "(?<month>\\d{2})",
  day: "(?<day>\\d{2})",
  hour: "(?<hour>\\d{2})",
  minute: "(?<minute>\\d{2})",
  second: "(?<second>\\d{2})",
  dateSep: "[_\\s-]",
  timeSep: "[-:]",
} as const;

const { year, month, day, hour, minute, second, dateSep, timeSep } =
  DATE_TIME_PATTERNS_COMPONENTS;

// Regex patterns for parsing dates/times from filenames, in order of specificity
const DATE_TIME_PARSE_PATTERNS = [
  // YYYYMMDD HHMMSS with various date/time separators
  `${year}${month}${day}${dateSep}${hour}${minute}${second}`,
  // YYYY-MM-DD HH-MM-SS or YYYY-MM-DD HH:MM:SS
  `${year}-${month}-${day}[_\\s-]${hour}${timeSep}${minute}${timeSep}${second}`,
  // YYYY_MM_DD_HH_MM_SS
  `${year}_${month}_${day}_${hour}_${minute}_${second}`,
  // Date only YYYYMMDD
  `${year}${month}${day}`,
  // Date only YYYY-MM-DD
  `${year}-${month}-${day}`,
].map((pattern) => new RegExp(`\\b${pattern}\\b`));

/**
 * Attempt to parse a datetime from a file name using common formats from cameras, phones, and apps.
 * Supports date/time patterns like: YYYYMMDD, YYYY-MM-DD, HH:MM:SS, HHMMSS
 * Returns null if no recognized format matches.
 */
export function parseDateTimeFromName(fileName: string): Date | null {
  // Remove file extension for cleaner parsing
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");

  for (const pattern of DATE_TIME_PARSE_PATTERNS) {
    const groups = nameWithoutExt.match(pattern)?.groups;
    if (groups) {
      const yearNum = parseInt(groups.year, 10);
      const monthNum = parseInt(groups.month, 10);
      const dayNum = parseInt(groups.day, 10);
      const hourNum = groups.hour ? parseInt(groups.hour, 10) : 0;
      const minuteNum = groups.minute ? parseInt(groups.minute, 10) : 0;
      const secondNum = groups.second ? parseInt(groups.second, 10) : 0;

      // Validate ranges
      if (
        yearNum < 1990 ||
        yearNum > 3000 ||
        monthNum < 1 ||
        monthNum > 12 ||
        dayNum < 1 ||
        dayNum > 31
      ) {
        continue;
      }
      if (hourNum > 23 || minuteNum > 59 || secondNum > 59) {
        continue;
      }

      // Create date (month is 0-indexed for Date constructor)
      const date = new Date(
        yearNum,
        monthNum - 1,
        dayNum,
        hourNum,
        minuteNum,
        secondNum,
      );

      // Verify the date is valid
      if (Number.isNaN(date.getTime())) {
        continue;
      }

      return date;
    }
  }

  return null;
}

type DateLikeInput = string | Date | null | undefined;

function parseDateLikeInput(value: DateLikeInput): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * Resolve media datetime with a consistent fallback order:
 * metadata datetime -> datetime parsed from filename -> created time -> modified time.
 */
export function resolveMediaDateTime({
  metadataTime,
  fileName,
  createdTime,
  modifiedTime,
}: {
  metadataTime: DateLikeInput;
  fileName: string | null | undefined;
  createdTime: DateLikeInput;
  modifiedTime: DateLikeInput;
}): Date | null {
  const metadataDate = parseDateLikeInput(metadataTime);
  if (metadataDate) {
    return metadataDate;
  }

  if (fileName) {
    const parsedFromName = parseDateTimeFromName(fileName);
    if (parsedFromName) {
      return parsedFromName;
    }
  }

  const createdDate = parseDateLikeInput(createdTime);
  if (createdDate) {
    return createdDate;
  }

  return parseDateLikeInput(modifiedTime);
}

/**
 * Throttle an async function with burst support.
 * Allows up to callsPerSecond executions per one-second window.
 * Additional calls wait for the next window.
 */
export function throttle<Args extends readonly unknown[], Return>(
  func: (...args: Args) => Promise<Return>,
  callsPerSecond: number,
): (...args: Args) => Promise<Return> {
  let windowStart = Date.now();
  let usedInWindow = 0;

  return async (...args: Args) => {
    while (true) {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        usedInWindow = 0;
      }

      if (usedInWindow < callsPerSecond) {
        usedInWindow += 1;
        return await func(...args);
      }

      const waitMs = Math.max(0, 1000 - (now - windowStart));
      await sleep(waitMs);
    }
  };
}
