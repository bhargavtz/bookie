import { toIsbn13 } from "./isbn";

/**
 * Advisory duplicate detection helpers (pure). A match is a hint for the admin
 * duplicate-review queue, never an automatic rejection. The authoritative
 * exact-duplicate guard is the partial unique index on assets.sha256.
 */

const LEADING_ARTICLES = /^(?:the|a|an)\s+/;
const EDITION_MARKERS = /\b(?:\d+(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth)\s+(?:edition|ed)\b|\b(?:edition|ed)\s+\d+\b/g;

/** Lower-cased, accent-folded, punctuation-free, article- and edition-free title. */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/c\+\+/g, "cpp")
    .replace(/c#/g, "csharp")
    .replace(EDITION_MARKERS, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(LEADING_ARTICLES, "")
    .replace(/\s+/g, " ");
}

function bigrams(s: string): Map<string, number> {
  const map = new Map<string, number>();
  const compact = s.replace(/\s+/g, " ");
  for (let i = 0; i < compact.length - 1; i++) {
    const g = compact.slice(i, i + 2);
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return map;
}

/** Sorensen-Dice coefficient on character bigrams, 0..1. */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return a.length === 0 ? 0 : 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  let total = 0;
  for (const n of ga.values()) total += n;
  for (const n of gb.values()) total += n;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  return (2 * overlap) / total;
}

export type DuplicateCandidate = { title: string; isbn13?: string | null; sha256?: string | null };
export type DuplicateMatch = { kind: "sha256" | "isbn13" | "title"; score: number };

export const DEFAULT_TITLE_THRESHOLD = 0.9;

/** Strongest signal wins: identical file hash, then identical ISBN-13, then near-identical title. */
export function compareForDuplicate(
  a: DuplicateCandidate,
  b: DuplicateCandidate,
  titleThreshold: number = DEFAULT_TITLE_THRESHOLD,
): DuplicateMatch | null {
  if (a.sha256 && b.sha256 && a.sha256 === b.sha256) return { kind: "sha256", score: 1 };
  const ia = a.isbn13 ? toIsbn13(a.isbn13) : null;
  const ib = b.isbn13 ? toIsbn13(b.isbn13) : null;
  if (ia !== null && ia === ib) return { kind: "isbn13", score: 1 };
  const score = diceCoefficient(normalizeTitle(a.title), normalizeTitle(b.title));
  if (score >= titleThreshold) return { kind: "title", score };
  return null;
}
