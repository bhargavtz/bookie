import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { getEnv } from "@/lib/env";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildBookJsonLd, buildBreadcrumbJsonLd, buildPageMetadata } from "@/lib/seo";
import type { BookDetail } from "@/contracts/catalogue";
import { catalogueListQuerySchema, publicSearchQuerySchema } from "@/lib/search/schemas";
import type { SearchHit } from "@/lib/search/types";
import { BookActions } from "@/components/books/BookActions";
import { BookGrid } from "@/components/books/BookCard";
import {
  LEVEL_LABELS,
  LICENSE_LABELS,
  authorFilterSlug,
  categoryHref,
  downloadHref,
  hrefWith,
  languageLabel,
  readHref,
} from "@/components/books/links";
import { Breadcrumbs, PageShell } from "@/components/home/PageShell";
import { Badge } from "@/components/ui/Badge";
import { BookCover3D } from "@/components/ui/BookCover3D";
import { buttonClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { CatalogueError, getCatalogueService } from "@/server/services/catalogue";
import { categoryNameMap, getCategories, load } from "../../_lib/data";

type PageProps = { params: Promise<{ slug: string }> };

const RELATED_LIMIT = 4;

function summarise(description: string | null, fallback: string): string {
  const text = (description ?? "").replace(/\s+/g, " ").trim();
  if (text === "") return fallback;
  return text.length <= 158 ? text : `${text.slice(0, 157).trimEnd()}…`;
}

// The title and description are emitted only when the catalogue says the book is listable (getBook enforces canList).
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const book = await (await getCatalogueService()).getBook(slug);
    const description = summarise(book.description, `${book.title} in the Bookie library.`);
    return buildPageMetadata({
      title: book.title,
      description,
      path: `/book/${encodeURIComponent(book.slug)}`,
      siteUrl: getEnv().SITE_URL,
      openGraphType: "book",
    });
  } catch (error) {
    if (error instanceof CatalogueError) return { title: "Book not found", robots: { index: false, follow: false } };
    return { title: "Book" };
  }
}

async function loadShelves(book: BookDetail): Promise<{ related: SearchHit[]; sameAuthor: SearchHit[] }> {
  const service = await getCatalogueService();
  const others = (hits: SearchHit[]) => hits.filter((hit) => hit.slug !== book.slug).slice(0, RELATED_LIMIT);
  const primaryCategory = book.categorySlugs[0];
  const firstAuthor = book.authors[0];
  const [related, sameAuthor] = await Promise.all([
    primaryCategory === undefined
      ? Promise.resolve([])
      : service
          .searchBooks(publicSearchQuerySchema.parse({ category: primaryCategory, sort: "newest", limit: RELATED_LIMIT + 1 }))
          .then((page) => others(page.items)),
    firstAuthor === undefined
      ? Promise.resolve([])
      : service
          .listBooks(catalogueListQuerySchema.parse({ author: authorFilterSlug(firstAuthor), limit: RELATED_LIMIT + 1 }))
          .then((page) => others(page.items)),
  ]);
  return { related, sameAuthor };
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-3 sm:flex-row sm:gap-6">
      <dt className="w-40 shrink-0 text-sm font-medium text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-base text-ink">{children}</dd>
    </div>
  );
}

function ExternalLink({ url, children }: { url: string; children: ReactNode }) {
  if (!url.startsWith("https://")) return <>{children}</>;
  return (
    <a href={url} rel="noopener noreferrer nofollow" target="_blank">
      {children}
    </a>
  );
}

export default async function BookPage({ params }: PageProps) {
  const { slug } = await params;
  const result = await load(async () => (await getCatalogueService()).getBook(slug));
  if (!result.ok) {
    return (
      <PageShell currentPath="/library">
        <ErrorState title="This book could not be loaded" description="Something went wrong on our side. Try again in a moment." />
      </PageShell>
    );
  }
  const book = result.data;
  const [shelves, categories] = await Promise.all([load(() => loadShelves(book)), load(() => getCategories())]);
  const categoryNames = categoryNameMap(categories.ok ? categories.data : null);
  const primaryCategorySlug = book.categorySlugs[0];
  const authorLine = book.authors.join(", ");
  const paragraphs = (book.description ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p !== "");
  const license = book.license;
  const licenseLabel = license.licenseType === null ? null : (LICENSE_LABELS[license.licenseType] ?? license.licenseType);
  const hasRightsDetail =
    licenseLabel !== null || license.rightsHolder !== null || license.attributionText !== null || license.licenseUrl !== null || license.sourceUrl !== null;
  const topicLinks = [
    ...book.categorySlugs.map((s) => ({ key: `c:${s}`, label: categoryNames[s] ?? s, href: categoryHref(s) })),
    ...book.technologies.map((t) => ({ key: `t:${t.slug}`, label: t.name, href: hrefWith("/search", { technology: t.slug }) })),
  ];

  return (
    <PageShell currentPath="/library">
      <JsonLd data={buildBookJsonLd(book, getEnv().SITE_URL)} />
      <JsonLd
        data={buildBreadcrumbJsonLd(
          [
            { name: "Library", path: "/library" },
            ...(primaryCategorySlug === undefined ? [] : [{ name: categoryNames[primaryCategorySlug] ?? primaryCategorySlug, path: categoryHref(primaryCategorySlug) }]),
            { name: book.title, path: `/book/${encodeURIComponent(book.slug)}` },
          ],
          getEnv().SITE_URL,
        )}
      />
      <Breadcrumbs items={[{ label: "Library", href: "/library" }, { label: book.title }]} />

      <div className="grid gap-10 md:grid-cols-[auto_1fr] md:gap-14">
        <div className="flex justify-center md:justify-start">
          <BookCover3D title={book.title} {...(authorLine === "" ? {} : { author: authorLine })} size="lg" />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap gap-1.5">
            {book.level ? <Badge tone="accent">{LEVEL_LABELS[book.level] ?? book.level}</Badge> : null}
            {license.rightsStatus === "restricted" ? <Badge tone="warning">Restricted use</Badge> : null}
          </div>
          <h1 className="text-4xl text-ink">{book.title}</h1>
          {book.subtitle ? <p className="text-xl text-ink-muted">{book.subtitle}</p> : null}
          {authorLine !== "" ? (
            <p className="text-lg text-ink">
              by{" "}
              {book.authors.map((name, index) => (
                <span key={name}>
                  {index > 0 ? ", " : ""}
                  <Link href={hrefWith("/search", { author: authorFilterSlug(name) })}>{name}</Link>
                </span>
              ))}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {book.canRead ? (
              <Link href={readHref(book.slug)} className={buttonClassName({ size: "lg" })}>
                Read online
              </Link>
            ) : null}
            {book.canDownload ? (
              // A plain anchor: the route streams a file and must not be prefetched or client-routed.
              <a href={downloadHref(book.slug)} className={buttonClassName({ variant: "secondary", size: "lg" })}>
                Download PDF
              </a>
            ) : null}
            <BookActions slug={book.slug} title={book.title} />
          </div>
          {!book.canRead && !book.canDownload ? (
            <p className="max-w-prose text-sm text-ink-muted">
              Reading and downloading are not enabled for this title.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-14 grid gap-12 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-12">
          {paragraphs.length > 0 ? (
            <section aria-labelledby="about-heading" className="flex max-w-prose flex-col gap-4">
              <h2 id="about-heading" className="text-3xl">About</h2>
              {paragraphs.map((paragraph, index) => (
                <p key={index} className="text-lg text-ink">{paragraph}</p>
              ))}
            </section>
          ) : null}

          {shelves.ok && shelves.data.related.length > 0 ? (
            <section aria-labelledby="related-heading" className="flex flex-col gap-5">
              <h2 id="related-heading" className="text-3xl">Related books</h2>
              <BookGrid books={shelves.data.related} categoryNames={categoryNames} />
            </section>
          ) : null}

          {shelves.ok && shelves.data.sameAuthor.length > 0 && book.authors[0] ? (
            <section aria-labelledby="author-heading" className="flex flex-col gap-5">
              <h2 id="author-heading" className="text-3xl">More from {book.authors[0]}</h2>
              <BookGrid books={shelves.data.sameAuthor} categoryNames={categoryNames} />
            </section>
          ) : null}

          {topicLinks.length > 0 ? (
            <section aria-labelledby="topics-heading" className="flex flex-col gap-4">
              <h2 id="topics-heading" className="text-3xl">Similar topics</h2>
              <ul className="flex flex-wrap gap-2">
                {topicLinks.map((topic) => (
                  <li key={topic.key}>
                    <Link
                      href={topic.href}
                      className="inline-flex min-h-11 items-center rounded-pill border border-border-strong px-4 text-sm font-medium text-ink no-underline hover:bg-surface-sunken"
                    >
                      {topic.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside aria-label="Book details" className="flex flex-col gap-6">
          <Card tone="surface" className="p-5">
            <h2 className="mb-2 text-2xl">Details</h2>
            <dl>
              {book.publisher ? <Detail label="Publisher">{book.publisher}</Detail> : null}
              {book.edition ? <Detail label="Edition">{book.edition}</Detail> : null}
              {book.publishedYear !== null ? <Detail label="Year">{book.publishedYear}</Detail> : null}
              {book.pageCount !== null ? <Detail label="Pages">{book.pageCount}</Detail> : null}
              <Detail label="Language">{languageLabel(book.language)}</Detail>
              {book.isbn13 ? <Detail label="ISBN-13">{book.isbn13}</Detail> : null}
              {book.level ? <Detail label="Level">{LEVEL_LABELS[book.level] ?? book.level}</Detail> : null}
            </dl>
          </Card>

          {hasRightsDetail ? (
            <Card tone="surface" className="p-5">
              <h2 className="mb-2 text-2xl">Licence and rights</h2>
              <dl>
                {licenseLabel ? <Detail label="Licence">{licenseLabel}</Detail> : null}
                {license.rightsHolder ? <Detail label="Rights holder">{license.rightsHolder}</Detail> : null}
                {license.attributionText ? <Detail label="Attribution">{license.attributionText}</Detail> : null}
                {license.licenseUrl ? (
                  <Detail label="Licence terms">
                    <ExternalLink url={license.licenseUrl}>Read the licence</ExternalLink>
                  </Detail>
                ) : null}
                {license.sourceUrl ? (
                  <Detail label="Source">
                    <ExternalLink url={license.sourceUrl}>Original source</ExternalLink>
                  </Detail>
                ) : null}
              </dl>
              <p className="mt-3 text-sm text-ink-muted">
                Think this listing is wrong? <Link href="/takedown">Send a takedown request</Link>.
              </p>
            </Card>
          ) : null}
        </aside>
      </div>
    </PageShell>
  );
}
