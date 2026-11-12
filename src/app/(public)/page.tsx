import type { Metadata } from "next";
import Link from "next/link";
import { getEnv } from "@/lib/env";
import { buildPageMetadata } from "@/lib/seo";
import { BookGrid } from "@/components/books/BookCard";
import { categoryHref, collectionHref } from "@/components/books/links";
import { PageShell } from "@/components/home/PageShell";
import { SearchBox } from "@/components/home/SearchBox";
import { Shelf } from "@/components/home/Shelf";
import { LEARNING_PATHS, resolveLearningPaths } from "@/components/home/learning-paths";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { categoryNameMap, getCategories, getCollectionBooks, getCollections, getPopular, getRecent, load } from "./_lib/data";

const SHELF_SIZE = 4;

export function generateMetadata(): Metadata {
  return {
    ...buildPageMetadata({
      title: "Bookie: a better place to learn how technology works",
      description: "Search programming and computer science books by title, author and topic, and read them in your browser.",
      path: "/",
      siteUrl: getEnv().SITE_URL,
    }),
    title: { absolute: "Bookie: a better place to learn how technology works" },
  };
}

export default async function HomePage() {
  const [categories, collections, popular, recent] = await Promise.all([
    load(() => getCategories()),
    load(() => getCollections()),
    load(() => getPopular(SHELF_SIZE)),
    load(() => getRecent(SHELF_SIZE)),
  ]);
  const featuredCollection = collections.ok ? collections.data.find((collection) => collection.isFeatured) : undefined;
  const featured = featuredCollection
    ? await load(() => getCollectionBooks(featuredCollection.slug, SHELF_SIZE))
    : null;

  const names = categoryNameMap(categories.ok ? categories.data : null);
  const paths = categories.ok ? resolveLearningPaths(LEARNING_PATHS, categories.data.categories) : [];
  const totalBooks = categories.ok ? categories.data.totalBooks : 0;
  const unavailable = <ErrorState title="This section could not be loaded" description="Something went wrong on our side. Try reloading the page." />;

  return (
    <PageShell currentPath="/">
      <section aria-labelledby="hero-heading" className="flex flex-col items-start gap-8 pt-6 pb-4 sm:pt-14">
        <div className="flex max-w-3xl flex-col gap-6">
          <p className="text-xs font-semibold tracking-[0.14em] text-accent-ink uppercase">Programming and computer science</p>
          <h1 id="hero-heading" className="text-5xl text-ink">
            A better place to learn how technology works.
          </h1>
          <p className="max-w-prose text-xl text-ink-muted">
            Search programming and computer science books by title, author and topic, and read them in your browser.
          </p>
        </div>
        <SearchBox className="max-w-3xl" />
        {totalBooks > 0 ? (
          <p className="text-sm text-ink-muted">
            {totalBooks} {totalBooks === 1 ? "book" : "books"} in the library.{" "}
            <Link href="/library">Browse them all</Link>
          </p>
        ) : null}
      </section>

      <Shelf id="featured-heading" title="Featured books" {...(featuredCollection ? { href: collectionHref(featuredCollection.slug), hrefLabel: featuredCollection.title } : {})}>
        {featured !== null && !featured.ok ? (
          unavailable
        ) : featured?.ok && featured.data.books.items.length > 0 ? (
          <BookGrid books={featured.data.books.items} categoryNames={names} />
        ) : (
          <EmptyState title="Nothing is featured yet" description="Books chosen by the editors appear here." action={<Link href="/library" className="font-medium">Browse the library</Link>} />
        )}
      </Shelf>

      <Shelf id="topics-heading" title="Browse by topic" href="/category" hrefLabel="All categories">
        {!categories.ok ? (
          unavailable
        ) : categories.data.categories.length === 0 ? (
          <EmptyState title="No topics yet" description="Topics appear here once they are set up." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.data.categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={categoryHref(category.slug)}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3 text-ink no-underline shadow-sm transition-colors hover:border-border-strong hover:bg-surface-sunken"
                >
                  <span className="font-medium">{category.name}</span>
                  <span className="text-sm text-ink-muted">{category.bookCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Shelf>

      <Shelf id="popular-heading" title="Most popular" intro="Ranked by completed downloads." href="/library?sort=popularity">
        {!popular.ok ? (
          unavailable
        ) : popular.data.items.length === 0 ? (
          <EmptyState title="No popular titles yet" description="This shelf fills in as readers download books." />
        ) : (
          <BookGrid books={popular.data.items} categoryNames={names} />
        )}
      </Shelf>

      <Shelf id="recent-heading" title="Recently added" href="/library">
        {!recent.ok ? (
          unavailable
        ) : recent.data.items.length === 0 ? (
          <EmptyState title="The library is empty" description="No titles have been published yet. Check back soon." />
        ) : (
          <BookGrid books={recent.data.items} categoryNames={names} />
        )}
      </Shelf>

      <Shelf id="collections-heading" title="Curated collections" href="/collections">
        {!collections.ok ? (
          unavailable
        ) : collections.data.length === 0 ? (
          <EmptyState title="No collections yet" description="Collections appear here once an editor publishes one." />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {collections.data.slice(0, 6).map((collection) => (
              <li key={collection.slug} className="flex">
                <Card interactive className="relative flex w-full flex-col gap-2">
                  {collection.isFeatured ? <Badge tone="accent" className="self-start">Featured</Badge> : null}
                  <h3 className="text-2xl">
                    <Link href={collectionHref(collection.slug)} className="text-ink no-underline after:absolute after:inset-0 hover:underline">
                      {collection.title}
                    </Link>
                  </h3>
                  {collection.description ? <p className="text-base text-ink-muted">{collection.description}</p> : null}
                  <p className="mt-auto pt-2 text-sm font-medium text-accent-ink">
                    {collection.bookCount} {collection.bookCount === 1 ? "book" : "books"}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Shelf>

      <Shelf id="paths-heading" title="Learning paths" intro="Follow a topic sequence from the first step to the last.">
        {!categories.ok ? (
          unavailable
        ) : paths.length === 0 ? (
          <EmptyState title="No learning paths yet" description="Paths appear here once the topics they use exist in the library." />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {paths.map((path) => (
              <li key={path.id}>
                <Card className="flex h-full flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-2xl">{path.title}</h3>
                    <p className="text-base text-ink-muted">{path.summary}</p>
                  </div>
                  <ol className="flex flex-col gap-2">
                    {path.steps.map((step, index) => (
                      <li key={step.slug} className="flex items-center gap-3">
                        <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-accent-subtle text-sm font-semibold text-accent-ink">
                          {index + 1}
                        </span>
                        <Link href={categoryHref(step.slug)} className="min-h-9 content-center font-medium">
                          {step.name}
                        </Link>
                        <span className="ml-auto text-sm text-ink-muted">
                          {step.bookCount} {step.bookCount === 1 ? "book" : "books"}
                        </span>
                      </li>
                    ))}
                  </ol>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Shelf>
    </PageShell>
  );
}
