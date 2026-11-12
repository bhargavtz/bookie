import { authorFilterSlug, cursorForPage, flattenSearchParams, pageFromParam, type QueryValues } from "@/components/books/links";
import type { FilterValues } from "@/components/books/FilterForm";

export type ListParams = {
  /** What the schemas parse: filters, sort, cursor, limit. */
  input: Record<string, string | number | undefined>;
  /** Form defaults. */
  values: FilterValues;
  /** Current URL query without `page`, used to build pager links. */
  query: QueryValues;
  page: number;
  hasFilters: boolean;
};

const FILTER_KEYS = ["topic", "author", "level", "language", "year", "format", "license"] as const;

/**
 * Turns raw search params into schema input. The author field takes a name, so
 * it is converted to the slug the catalogue filters by. Parsing and defaults
 * stay in the S2 schemas; this only prepares their input.
 */
export function prepareListParams(raw: Record<string, string | string[] | undefined>, pageSize: number): ListParams {
  const flat = flattenSearchParams(raw);
  const page = pageFromParam(flat.page);
  const author = flat.author?.trim() ? authorFilterSlug(flat.author) : undefined;
  const cursor = cursorForPage(page, pageSize);

  const input: ListParams["input"] = { ...flat, author, limit: pageSize, cursor };
  delete input.page;

  const query: QueryValues = { ...flat };
  delete query.page;

  return {
    input,
    values: { ...flat },
    query,
    page,
    hasFilters: FILTER_KEYS.some((key) => (flat[key] ?? "").trim() !== ""),
  };
}
