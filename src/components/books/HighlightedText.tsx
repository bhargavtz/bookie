import type { HighlightSegment } from "@/lib/search/highlight";

/** Renders highlight segments as text and <mark>. Never builds markup from a string. */
export function HighlightedText({ segments, fallback }: { segments: readonly HighlightSegment[] | undefined; fallback: string }) {
  if (segments === undefined || segments.length === 0) return <>{fallback}</>;
  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="rounded-xs bg-warning-subtle px-0.5 text-ink">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
