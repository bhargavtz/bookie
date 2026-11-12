/** Opaque pagination cursor. Offset-based because relevance and popularity orderings have no stable keyset. */

const MAX_OFFSET = 10_000;

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}

export function encodeCursor(offset: number): string {
  return toBase64Url(JSON.stringify({ o: offset }));
}

/** Returns the offset, or null when the cursor is malformed, negative or absurdly deep. */
export function decodeCursor(cursor: string): number | null {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(cursor));
    if (typeof parsed !== "object" || parsed === null || !("o" in parsed)) return null;
    const offset = (parsed as { o: unknown }).o;
    if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) return null;
    return offset;
  } catch {
    return null;
  }
}
