import type { Metadata } from "next";
import Link from "next/link";
import { getEnv } from "@/lib/env";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildBreadcrumbJsonLd, buildPageMetadata, canonicalPageQuery, hasNonPageQuery } from "@/lib/seo";
import { catalogueListQuerySchema } from "@/lib/search/schemas";
import { BookGrid } from "@/components/books/BookCard";
import { Pagination } from "@/components/books/Pagination";
import { SortLinks } from "@/components/books/SortLinks";
import { categoryHref, firstParam, pageFromParam, cursorForPage, totalPages } from "@/components/books/links";
import { Breadcrumbs, PageHeading, PageShell } from "@/components/home/PageShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { CatalogueError, getCatalogueService } from "@/server/services/catalogue";
import { categoryNameMap, getCategories, load } from "../../_lib/data";

const PAGE_SIZE = 24;

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "title", label: "Title A to Z" },
  { value: "popularity", label: "Most downloaded" },
] as const;

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const raw = await searchParams;
  try {
    const category = await (await getCatalogueService()).getCategory(slug);
    const sorted = hasNonPageQuery(raw);
    const query = sorted ? undefined : canonicalPageQuery(firstParam(raw.page));
    return buildPageMetadata({
      title: category.name,
      description: category.description ?? `Books about ${category.name} in the Bookie library.`,
      path: categoryHref(slug),
      siteUrl: getEnv().SITE_URL,
      ...(query === undefined ? {} : { query }),
      noindex: sorted,
    });
  } catch (error) {
    if (error instanceof CatalogueError) return { title: "Category not found", robots: { index: false } };
    return { title: "Category" };
  }
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const raw = await searchParams;
  const page = pageFromParam(firstParam(raw.page));
  const parsed = catalogueListQuerySchema.safeParse({
    category: slug,
    sort: firstParam(raw.sort),
    limit: PAGE_SIZE,
    cursor: cursorForPage(page, PAGE_SIZE),
  });

  const category = await load(async () => (await getCatalogueService()).getCategory(slug));
  if (!category.ok) {
    return (
      <PageShell currentPath="/category">
        <ErrorState title="This category could not be loaded" description="Something went wrong on our side. Try again in a moment." />
      </PageShell>
    );
  }
  const sort = parsed.success ? parsed.data.sort : "newest";
  const [books, categories] = await Promise.all([
    parsed.success ? load(async () => (await getCatalogueService()).listBooks(parsed.data)) : Promise.resolve(null),
    load(() => getCategories()),
  ]);

  return (
    <PageShell currentPath="/category">
      <JsonLd
        data={buildBreadcrumbJsonLd(
          [
            { name: "Categories", path: "/category" },
            { name: category.data.name, path: categoryHref(slug) },
          ],
          getEnv().SITE_URL,
        )}
      />
      <Breadcrumbs items={[{ label: "Categories", href: "/category" }, { label: category.data.name }]} />
      <PageHeading
        title={category.data.name}
        {...(category.data.description ? { intro: category.data.description } : {})}
      />
      <SortLinks path={categoryHref(slug)} query={{}} current={sort} options={SORTS} />
      {books === null || !books.ok ? (
        <ErrorState title="Books could not be loaded" description="Something went wrong on our side. Try again in a moment." />
      ) : books.data.items.length === 0 ? (
        <EmptyState
          title={page > 1 ? "There are no books on this page" : "No books in this category yet"}
          description={page > 1 ? "That page is past the end of the list." : "Titles appear here once they are published."}
          action={<Link href="/library" className="font-medium">Browse the whole library</Link>}
        />
      ) : (
        <>
          <p className="mb-5 text-sm text-ink-muted">
            {books.data.total ?? books.data.items.length} {(books.data.total ?? books.data.items.length) === 1 ? "book" : "books"}
          </p>
          <BookGrid books={books.data.items} categoryNames={categoryNameMap(categories.ok ? categories.data : null)} />
          <Pagination
            path={categoryHref(slug)}
            query={{ sort: sort === "newest" ? undefined : sort }}
            page={page}
            lastPage={totalPages(books.data.total ?? 0, PAGE_SIZE)}
          />
        </>
      )}
    </PageShell>
  );
}
