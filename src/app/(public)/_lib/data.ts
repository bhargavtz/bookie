import "server-only";
import { unstable_cache } from "next/cache";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { Page } from "@/contracts/catalogue";
import type { CategoryList, CollectionSummary, SearchHit } from "@/lib/search/types";
import { CatalogueError, getCatalogueService } from "@/server/services/catalogue";

/**
 * Data access for the public pages. Pages are rendered per request (the build
 * must never open the database); shared shelves are cached for SHELF_REVALIDATE
 * seconds with unstable_cache so a busy homepage does not query on every hit.
 * Book detail and list pages with filters are never cached, so a takedown or a
 * rights change shows up on the next request.
 */
export const SHELF_REVALIDATE = 60;

export type Loaded<T> = { ok: true; data: T } | { ok: false };

/** Runs a loader; not_found and gone become a 404, any other failure is reported as { ok: false }. */
export async function load<T>(run: () => Promise<T>): Promise<Loaded<T>> {
  await connection();
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    if (error instanceof CatalogueError && (error.code === "not_found" || error.code === "gone")) notFound();
    // Name only: error messages from the database layer can carry connection details.
    console.error("public page data load failed", error instanceof Error ? error.name : "unknown");
    return { ok: false };
  }
}

export const getCategories = unstable_cache(
  async (): Promise<CategoryList> => (await getCatalogueService()).listCategories(),
  ["public", "categories"],
  { revalidate: SHELF_REVALIDATE },
);

export const getCollections = unstable_cache(
  async (): Promise<CollectionSummary[]> => (await getCatalogueService()).listCollections(),
  ["public", "collections"],
  { revalidate: SHELF_REVALIDATE },
);

export const getRecent = unstable_cache(
  async (limit: number): Promise<Page<SearchHit>> => (await getCatalogueService()).recentlyAdded(limit),
  ["public", "recent"],
  { revalidate: SHELF_REVALIDATE },
);

export const getPopular = unstable_cache(
  async (limit: number): Promise<Page<SearchHit>> => (await getCatalogueService()).popular(limit),
  ["public", "popular"],
  { revalidate: SHELF_REVALIDATE },
);

export const getCollectionBooks = unstable_cache(
  async (slug: string, limit: number) => (await getCatalogueService()).getCollection(slug, { limit }),
  ["public", "collection-books"],
  { revalidate: SHELF_REVALIDATE },
);

export function categoryNameMap(list: CategoryList | null): Record<string, string> {
  const names: Record<string, string> = {};
  for (const category of list?.categories ?? []) names[category.slug] = category.name;
  return names;
}
