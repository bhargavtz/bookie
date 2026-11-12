import type { Metadata } from "next";
import Link from "next/link";
import { getEnv } from "@/lib/env";
import { buildPageMetadata, canonicalPageQuery, hasNonPageQuery } from "@/lib/seo";
import { catalogueListQuerySchema } from "@/lib/search/schemas";
import { BookGrid } from "@/components/books/BookCard";
import { FilterForm } from "@/components/books/FilterForm";
import { Pagination } from "@/components/books/Pagination";
import { totalPages } from "@/components/books/links";
import { PageHeading, PageShell } from "@/components/home/PageShell";
import { SearchBox } from "@/components/home/SearchBox";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { getCatalogueService } from "@/server/services/catalogue";
import { categoryNameMap, getCategories, load } from "../_lib/data";
import { prepareListParams } from "../_lib/params";

const PAGE_SIZE = 24;

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Filtered or sorted views duplicate the plain list, so they are noindex and canonicalise to it; plain pagination stays indexable.
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const filtered = hasNonPageQuery(params);
  const query = filtered ? undefined : canonicalPageQuery(typeof params.page === "string" ? params.page : undefined);
  return buildPageMetadata({
    title: "Library",
    description: "Browse the Bookie library by topic, author, year, language and licence.",
    path: "/library",
    siteUrl: getEnv().SITE_URL,
    ...(query === undefined ? {} : { query }),
    noindex: filtered,
  });
}

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "title", label: "Title A to Z" },
  { value: "popularity", label: "Most downloaded" },
] as const;

export default async function LibraryPage({ searchParams }: PageProps) {
  const prepared = prepareListParams(await searchParams, PAGE_SIZE);
  const parsed = catalogueListQuerySchema.safeParse(prepared.input);

  const categories = await load(() => getCategories());
  const topics = categories.ok ? categories.data.categories : [];

  const result = parsed.success ? await load(async () => (await getCatalogueService()).listBooks(parsed.data)) : null;

  return (
    <PageShell currentPath="/library">
      <PageHeading eyebrow="Library" title="Browse the library" intro="Every title here comes from the library catalogue. Filter by topic, author, year, language or licence." />
      <SearchBox size="compact" className="mb-6 max-w-2xl" />
      <FilterForm
        action="/library"
        values={prepared.values}
        topics={topics}
        sorts={SORTS}
        active={prepared.hasFilters}
      />

      {!parsed.success ? (
        <ErrorState
          title="Those filters are not valid"
          description="One of the filter values could not be read. Reset the filters and try again."
          action={<Button href="/library" variant="secondary">Reset filters</Button>}
        />
      ) : result === null || !result.ok ? (
        <ErrorState
          title="The library could not be loaded"
          description="Something went wrong on our side. Try again in a moment."
          action={<Button href="/library" variant="secondary">Try again</Button>}
        />
      ) : result.data.items.length === 0 ? (
        <EmptyState
          title={
            prepared.page > 1 ? "There are no books on this page" : prepared.hasFilters ? "No books match these filters" : "The library is empty"
          }
          description={
            prepared.page > 1
              ? "That page is past the end of the results."
              : prepared.hasFilters
                ? "Loosen a filter or reset them to see more."
                : "No titles have been published yet. Check back soon."
          }
          action={
            prepared.hasFilters || prepared.page > 1 ? (
              <Link href="/library" className="font-medium">
                {prepared.hasFilters ? "Reset filters" : "Back to the first page"}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mb-5 text-sm text-ink-muted" aria-live="polite">
            {result.data.total ?? result.data.items.length} {(result.data.total ?? result.data.items.length) === 1 ? "book" : "books"}
            {prepared.page > 1 ? `, page ${prepared.page}` : ""}
          </p>
          <BookGrid books={result.data.items} categoryNames={categoryNameMap(categories.ok ? categories.data : null)} />
          <Pagination path="/library" query={prepared.query} page={prepared.page} lastPage={totalPages(result.data.total ?? 0, PAGE_SIZE)} />
        </>
      )}
    </PageShell>
  );
}
