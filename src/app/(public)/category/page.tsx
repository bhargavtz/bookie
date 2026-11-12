import type { Metadata } from "next";
import Link from "next/link";
import { getEnv } from "@/lib/env";
import { buildPageMetadata } from "@/lib/seo";
import { categoryHref } from "@/components/books/links";
import { PageHeading, PageShell } from "@/components/home/PageShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { getCategories, load } from "../_lib/data";

export function generateMetadata(): Metadata {
  return buildPageMetadata({ title: "Categories", description: "Browse the Bookie library by topic.", path: "/category", siteUrl: getEnv().SITE_URL });
}

export default async function CategoryIndexPage() {
  const result = await load(() => getCategories());

  return (
    <PageShell currentPath="/category">
      <PageHeading eyebrow="Browse" title="Categories" intro="Topics in the library, with the number of books in each." />
      {!result.ok ? (
        <ErrorState title="Categories could not be loaded" description="Something went wrong on our side. Try again in a moment." />
      ) : result.data.categories.length === 0 ? (
        <EmptyState title="No categories yet" description="Categories appear here once they are set up." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.data.categories.map((category) => (
            <li key={category.slug} className="flex">
              <Card interactive className="relative flex w-full flex-col gap-2">
                <h2 className="text-2xl">
                  <Link href={categoryHref(category.slug)} className="text-ink no-underline after:absolute after:inset-0 hover:underline">
                    {category.name}
                  </Link>
                </h2>
                {category.description ? <p className="text-base text-ink-muted">{category.description}</p> : null}
                <p className="mt-auto pt-2 text-sm font-medium text-accent-ink">
                  {category.bookCount} {category.bookCount === 1 ? "book" : "books"}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
