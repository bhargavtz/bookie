/**
 * Search highlighting without HTML. The database marks matches with two
 * control characters; this turns the marked string into plain segments that
 * components render as text and `<mark>`, so no markup string ever reaches
 * the page and no `dangerouslySetInnerHTML` is needed.
 */

export const HIGHLIGHT_START = "\u0001";
export const HIGHLIGHT_STOP = "\u0002";

export type HighlightSegment = { text: string; match: boolean };

export function parseHighlight(marked: string | null | undefined): HighlightSegment[] {
  if (marked === null || marked === undefined || marked === "") return [];
  const segments: HighlightSegment[] = [];
  let buffer = "";
  let inMatch = false;
  const flush = (): void => {
    if (buffer.length > 0) segments.push({ text: buffer, match: inMatch });
    buffer = "";
  };
  for (const char of marked) {
    if (char === HIGHLIGHT_START) {
      flush();
      inMatch = true;
    } else if (char === HIGHLIGHT_STOP) {
      flush();
      inMatch = false;
    } else {
      buffer += char;
    }
  }
  flush();
  return segments;
}

/** True when at least one segment is a match (a snippet without a match is just an excerpt). */
export function hasMatch(segments: readonly HighlightSegment[]): boolean {
  return segments.some((segment) => segment.match);
}
