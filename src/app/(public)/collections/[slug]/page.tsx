import type { Metadata } from "next";
import Link from "next/link";
import { getEnv } from "@/lib/env";
import { buildPageMetadata, canonicalPageQuery, hasNonPageQuery } from "@/lib/seo";
import { BookGrid } from "@/components/books/BookCard";
import { Pagination } from "@/components/books/Pagination";
import { collectionHref, cursorForPage, firstParam, pageFromParam, totalPages } from "@/components/books/links";
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

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const raw = await searchParams;
  try {
    const { collection } = await (await getCatalogueService()).getCollection(slug, { limit: 1 });
    const extra = hasNonPageQuery(raw);
    const query = extra ? undefined : canonicalPageQuery(firstParam(raw.page));
    return buildPageMetadata({
      title: collection.title,
      description: collection.description ?? `A collection of books from the Bookie library.`,
      path: collectionHref(slug),
      siteUrl: getEnv().SITE_URL,
      ...(query === undefined ? {} : { query }),
      noindex: extra,
    });
  } catch (error) {
    if (error instanceof CatalogueError) return { title: "Collection not found", robots: { index: false } };
    return { title: "Collection" };
  }
}

export default async function CollectionPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const page = pageFromParam(firstParam((await searchParams).page));
  const cursor = cursorForPage(page, PAGE_SIZE);
  const [result, categories] = await Promise.all([
    load(async () => (await getCatalogueService()).getCollection(slug, { limit: PAGE_SIZE, cursor })),
    load(() => getCategories()),
  ]);

  if (!result.ok) {
    return (
      <PageShell currentPath="/collections">
        <ErrorState title="This collection could not be loaded" description="Something went wrong on our side. Try again in a moment." />
      </PageShell>
    );
  }
  const { collection, books } = result.data;

  return (
    <PageShell currentPath="/collections">
      <Breadcrumbs items={[{ label: "Collections", href: "/collections" }, { label: collection.title }]} />
      <PageHeading title={collection.title} {...(collection.description ? { intro: collection.description } : {})} />
      {books.items.length === 0 ? (
        <EmptyState
          title={page > 1 ? "There are no books on this page" : "This collection has no available books"}
          description="Books in a collection show here only while they are published."
          action={<Link href={page > 1 ? collectionHref(slug) : "/library"} className="font-medium">{page > 1 ? "Back to the first page" : "Browse the library"}</Link>}
        />
      ) : (
        <>
          <BookGrid books={books.items} categoryNames={categoryNameMap(categories.ok ? categories.data : null)} />
          <Pagination path={collectionHref(slug)} query={{}} page={page} lastPage={totalPages(books.total ?? 0, PAGE_SIZE)} />
        </>
      )}
    </PageShell>
  );
}
