/** Pure URL and paging helpers shared by the public pages. No I/O. */
import { encodeCursor } from "@/lib/search/cursor";
import { slugify } from "@/lib/slug";

export type QueryValues = Record<string, string | number | undefined>;

export const bookHref = (slug: string): string => `/book/${encodeURIComponent(slug)}`;
export const categoryHref = (slug: string): string => `/category/${encodeURIComponent(slug)}`;
export const collectionHref = (slug: string): string => `/collections/${encodeURIComponent(slug)}`;
export const readHref = (slug: string): string => `/read/${encodeURIComponent(slug)}`;
export const downloadHref = (slug: string): string => `/api/books/${encodeURIComponent(slug)}/download`;

/** Query string without blanks; keys keep insertion order. Empty result gives "". */
export function buildQuery(values: QueryValues): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

export function hrefWith(path: string, values: QueryValues): string {
  return `${path}${buildQuery(values)}`;
}

/** 1-based page from a query value. Anything unusable is page 1. */
export function pageFromParam(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 500 ? page : 1;
}

/** Cursor for the first row of `page`; undefined for page 1. The server decodes it as an offset. */
export function cursorForPage(page: number, pageSize: number): string | undefined {
  return page <= 1 ? undefined : encodeCursor((page - 1) * pageSize);
}

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * Pages to show in a pager: first, last, and a window around the current page,
 * with `null` marking a gap.
 */
export function pagerItems(current: number, last: number, radius = 1): Array<number | null> {
  const wanted = new Set<number>([1, last]);
  for (let page = current - radius; page <= current + radius; page += 1) {
    if (page >= 1 && page <= last) wanted.add(page);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const items: Array<number | null> = [];
  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && page - previous > 1) items.push(null);
    items.push(page);
  });
  return items;
}

/** The catalogue filters authors by slug; the slug of a name is its slugified form. */
export const authorFilterSlug = (name: string): string => slugify(name);

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function flattenSearchParams(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const first = firstParam(value);
    if (first !== undefined) out[key] = first;
  }
  return out;
}

/** Native name of a BCP 47 tag in English, falling back to the tag itself. */
export function languageLabel(tag: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

export const LICENSE_LABELS: Record<string, string> = {
  "project-original": "Project original",
  "public-domain": "Public domain",
  "cc-by": "CC BY",
  "cc-by-sa": "CC BY-SA",
  "cc-by-nc": "CC BY-NC",
  "publisher-permission": "Publisher permission",
  "author-permission": "Author permission",
  other: "Other licence",
};

export const LEVEL_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
