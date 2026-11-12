import { StorageKeyError } from "./types";

/**
 * Storage keys are opaque and server-generated. They are validated rather than
 * escaped: a key that is not in the safe alphabet is rejected, never repaired.
 */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_KEY_LENGTH = 512;

export function isSafeKey(key: string): boolean {
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) return false;
  const segments = key.split("/");
  return segments.every((s) => SEGMENT.test(s) && s !== "." && s !== ".." && !s.includes(".."));
}

export function assertSafeKey(key: string): string {
  if (!isSafeKey(key)) throw new StorageKeyError("unsafe storage key");
  return key;
}

const EXT = /^[a-z0-9]{1,8}$/;

/** books/{bookId}/{assetId}.{ext}: the only key shape the application generates. */
export function assetStorageKey(bookId: string, assetId: string, ext: string): string {
  if (!UUID.test(bookId) || !UUID.test(assetId) || !EXT.test(ext)) throw new StorageKeyError("invalid asset key parts");
  return `books/${bookId}/${assetId}.${ext}`;
}
