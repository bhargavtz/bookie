/**
 * Guest book bookmarks in localStorage (no accounts). Reads are validated and
 * survive missing or throwing storage. Separate from the reader's per-page
 * bookmarks, which live in the reader state.
 */
import { z } from "zod";
import { slugSchema } from "@/contracts/primitives";

export const BOOKMARKS_KEY = "bookie:book-bookmarks:v1";
export const MAX_BOOKMARKS = 500;

const bookmarksSchema = z.array(slugSchema).max(MAX_BOOKMARKS);

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = ReadableStorage & Pick<Storage, "setItem">;

export function readBookmarks(storage: ReadableStorage | null): string[] {
  if (storage === null) return [];
  try {
    const raw = storage.getItem(BOOKMARKS_KEY);
    if (raw === null || raw.length > 64_000) return [];
    const parsed = bookmarksSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Pure: the list with `slug` added or removed. Newest first, capped. */
export function toggleBookmark(current: readonly string[], slug: string): string[] {
  if (current.includes(slug)) return current.filter((entry) => entry !== slug);
  return [slug, ...current].slice(0, MAX_BOOKMARKS);
}

/** Returns false when storage is unavailable or full, so the UI can say so. */
export function writeBookmarks(storage: WritableStorage | null, slugs: readonly string[]): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(BOOKMARKS_KEY, JSON.stringify(slugs));
    return true;
  } catch {
    return false;
  }
}
