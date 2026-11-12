import type { Metadata } from "next";
import Link from "next/link";
import { getEnv } from "@/lib/env";
import { buildPageMetadata, hasNonPageQuery } from "@/lib/seo";
import { publicSearchQuerySchema } from "@/lib/search/schemas";
import { BookGrid } from "@/components/books/BookCard";
import { FilterForm } from "@/components/books/FilterForm";
import { Pagination } from "@/components/books/Pagination";
import { firstParam, totalPages } from "@/components/books/links";
import { PageHeading, PageShell } from "@/components/home/PageShell";
import { SearchBox } from "@/components/home/SearchBox";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { getCatalogueService } from "@/server/services/catalogue";
import { categoryNameMap, getCategories, load } from "../_lib/data";
import { prepareListParams } from "../_lib/params";

const PAGE_SIZE = 12;

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const SORTS = [
  { value: "relevance", label: "Best match" },
  { value: "newest", label: "Newest" },
  { value: "title", label: "Title A to Z" },
  { value: "popularity", label: "Most downloaded" },
] as const;

// Result pages (any query string) are noindex: the set of queries is unbounded and the content is the book pages themselves.
// The canonical is always the bare /search page, never a URL carrying the query.
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const q = firstParam(params.q)?.trim().slice(0, 80);
  return buildPageMetadata({
    title: q ? `Search: ${q}` : "Search",
    description: "Search the Bookie library by title, author and topic.",
    path: "/search",
    siteUrl: getEnv().SITE_URL,
    noindex: hasNonPageQuery(params),
  });
}

export default async function SearchPage({ searchParams }: PageProps) {
  const prepared = prepareListParams(await searchParams, PAGE_SIZE);
  const parsed = publicSearchQuerySchema.safeParse(prepared.input);
  const q = parsed.success ? (parsed.data.q ?? "") : (prepared.values.q ?? "");
  const searching = q !== "" || prepared.hasFilters;

  const categories = await load(() => getCategories());
  const topics = categories.ok ? categories.data.categories : [];
  const result =
    parsed.success && searching ? await load(async () => (await getCatalogueService()).searchBooks(parsed.data)) : null;

  const total = result?.ok ? (result.data.total ?? result.data.items.length) : 0;

  return (
    <PageShell currentPath="/search">
      <PageHeading eyebrow="Search" title={q ? `Results for “${q}”` : "Search the library"} />
      <SearchBox initialValue={q} size="hero" className="mb-8 max-w-3xl" />
      <FilterForm
        action="/search"
        values={prepared.values}
        topics={topics}
        sorts={SORTS}
        active={prepared.hasFilters}
        hiddenFields={q === "" ? {} : { q }}
      />

      {!parsed.success ? (
        <ErrorState
          title="That search is not valid"
          description="One of the search or filter values could not be read. Reset the filters and try again."
          action={<Button href="/search" variant="secondary">Start over</Button>}
        />
      ) : !searching ? (
        <EmptyState title="What are you looking for?" description="Search by title, author or topic, or open the library to browse everything." action={<Button href="/library" variant="secondary">Browse the library</Button>} />
      ) : result === null || !result.ok ? (
        <ErrorState
          title="Search is unavailable"
          description="Something went wrong on our side. Try again in a moment."
          action={<Button href={q ? `/search?q=${encodeURIComponent(q)}` : "/search"} variant="secondary">Try again</Button>}
        />
      ) : result.data.items.length === 0 ? (
        <EmptyState
          title={prepared.page > 1 ? "There are no results on this page" : "No books found"}
          description={
            prepared.page > 1
              ? "That page is past the end of the results."
              : "Check the spelling, try fewer words, or remove a filter."
          }
          action={
            <Link href={q ? `/search?q=${encodeURIComponent(q)}` : "/library"} className="font-medium">
              {q ? "Clear filters" : "Browse the library"}
            </Link>
          }
        />
      ) : (
        <>
          <p className="mb-5 text-sm text-ink-muted" role="status">
            {total} {total === 1 ? "result" : "results"}
            {prepared.page > 1 ? `, page ${prepared.page}` : ""}
          </p>
          <BookGrid books={result.data.items} categoryNames={categoryNameMap(categories.ok ? categories.data : null)} />
          <Pagination path="/search" query={prepared.query} page={prepared.page} lastPage={totalPages(total, PAGE_SIZE)} />
        </>
      )}
    </PageShell>
  );
}
