import { StorageRangeError, type ByteRange } from "./types";

/** Resolves a requested range against the object size to an inclusive [start, end]. */
export function resolveRange(size: number, range: ByteRange | undefined): { start: number; end: number } {
  if (range === undefined) {
    return { start: 0, end: Math.max(size - 1, 0) };
  }
  const { start } = range;
  if (!Number.isInteger(start) || start < 0 || (range.end !== undefined && (!Number.isInteger(range.end) || range.end < start))) {
    throw new StorageRangeError("invalid range");
  }
  if (start >= size) throw new StorageRangeError("range not satisfiable");
  const end = Math.min(range.end ?? size - 1, size - 1);
  return { start, end };
}
