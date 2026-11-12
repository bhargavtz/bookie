/**
 * HTTP Range / If-Range handling for a single representation. Pure.
 *
 * Policy (docs/wiki/decision-reader-and-state.md):
 *  - one range, suffix ranges and open-ended ranges are served as 206;
 *  - a syntactically valid range that starts beyond the end is 416;
 *  - multi-range requests, unknown units and malformed headers are ignored and
 *    answered with the full representation (RFC 9110 allows ignoring Range).
 */

export type RangeDecision =
  | { kind: "full" }
  | { kind: "partial"; start: number; end: number }
  | { kind: "unsatisfiable" };

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

export function parseRangeHeader(header: string | null, size: number): RangeDecision {
  if (header === null) return { kind: "full" };
  const value = header.trim();
  if (value.includes(",")) return { kind: "full" };
  const match = SINGLE_RANGE.exec(value);
  if (match === null) return { kind: "full" };
  const [, first = "", last = ""] = match;
  if (first === "" && last === "") return { kind: "full" };

  if (first === "") {
    // Suffix range: the last N bytes.
    const suffix = Number(last);
    if (!Number.isSafeInteger(suffix)) return { kind: "full" };
    if (suffix === 0 || size === 0) return { kind: "unsatisfiable" };
    return { kind: "partial", start: Math.max(size - suffix, 0), end: size - 1 };
  }

  const start = Number(first);
  if (!Number.isSafeInteger(start)) return { kind: "full" };
  if (last === "") {
    return start >= size ? { kind: "unsatisfiable" } : { kind: "partial", start, end: size - 1 };
  }
  const end = Number(last);
  if (!Number.isSafeInteger(end) || end < start) return { kind: "full" }; // invalid per RFC: ignore
  if (start >= size) return { kind: "unsatisfiable" };
  return { kind: "partial", start, end: Math.min(end, size - 1) };
}

const stripWeak = (tag: string): string => tag.trim().replace(/^W\//, "");

/**
 * If-Range: the Range header only applies when the validator still matches.
 * Only strong ETags are compared (a date validator is treated as a mismatch
 * unless it equals Last-Modified, which this app does not send).
 */
export function ifRangeAllowsRange(ifRange: string | null, etag: string): boolean {
  if (ifRange === null) return true;
  const value = ifRange.trim();
  if (value.startsWith("W/")) return false;
  return value === etag;
}

/** If-None-Match evaluation (weak comparison). */
export function ifNoneMatchMatches(header: string | null, etag: string): boolean {
  if (header === null) return false;
  const value = header.trim();
  if (value === "*") return true;
  const target = stripWeak(etag);
  return value.split(",").some((candidate) => stripWeak(candidate) === target);
}
