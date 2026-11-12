import type { Metadata } from "next";
import Link from "next/link";
import { getEnv } from "@/lib/env";
import { buildPageMetadata } from "@/lib/seo";
import { collectionHref } from "@/components/books/links";
import { PageHeading, PageShell } from "@/components/home/PageShell";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { getCollections, load } from "../_lib/data";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    title: "Collections",
    description: "Hand-picked collections of books from the Bookie library.",
    path: "/collections",
    siteUrl: getEnv().SITE_URL,
  });
}

export default async function CollectionsPage() {
  const result = await load(() => getCollections());

  return (
    <PageShell currentPath="/collections">
      <PageHeading eyebrow="Curated" title="Collections" intro="Groups of books chosen by the library's editors." />
      {!result.ok ? (
        <ErrorState title="Collections could not be loaded" description="Something went wrong on our side. Try again in a moment." />
      ) : result.data.length === 0 ? (
        <EmptyState title="No collections yet" description="Collections appear here once an editor publishes one." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.data.map((collection) => (
            <li key={collection.slug} className="flex">
              <Card interactive className="relative flex w-full flex-col gap-2">
                {collection.isFeatured ? <Badge tone="accent" className="self-start">Featured</Badge> : null}
                <h2 className="text-2xl">
                  <Link href={collectionHref(collection.slug)} className="text-ink no-underline after:absolute after:inset-0 hover:underline">
                    {collection.title}
                  </Link>
                </h2>
                {collection.description ? <p className="text-base text-ink-muted">{collection.description}</p> : null}
                <p className="mt-auto pt-2 text-sm font-medium text-accent-ink">
                  {collection.bookCount} {collection.bookCount === 1 ? "book" : "books"}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
