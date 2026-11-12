/**
 * Pure SEO builders: canonical URLs, Next metadata, JSON-LD and robots rules.
 * Nothing here reads the environment or the database; callers pass `siteUrl`
 * (from `getEnv().SITE_URL`) so the output is deterministic and unit-testable.
 */
import type { Metadata } from "next";
import type { MetadataRoute } from "next";

export const SITE_NAME = "Bookie";

/** Paths that must never be indexed or crawled. */
export const DISALLOWED_PATHS = ["/admin", "/api/admin"] as const;

export function absoluteUrl(path: string, siteUrl: string): string {
  return new URL(path, siteUrl).toString();
}

/** Canonical URLs never carry a query string or fragment unless `query` is passed explicitly. */
export function canonicalUrl(path: string, siteUrl: string, query?: Record<string, string>): string {
  const url = new URL(path, siteUrl);
  url.search = "";
  url.hash = "";
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

export type PageMetadataInput = {
  title: string;
  description: string;
  /** Site-relative path of the canonical page, e.g. "/book/some-slug". */
  path: string;
  siteUrl: string;
  /** Extra canonical query parameters (for example `page` on paginated lists). */
  query?: Record<string, string>;
  openGraphType?: "website" | "book" | "article";
  /** Adds `noindex` (links are still followed unless `follow` is false). */
  noindex?: boolean;
  follow?: boolean;
};

/**
 * Canonical, Open Graph and Twitter metadata. No image is emitted: the
 * library has no rights-cleared share image, and a book cover is not a public
 * asset URL. Twitter uses the text-only "summary" card.
 */
export function buildPageMetadata(input: PageMetadataInput): Metadata {
  const url = canonicalUrl(input.path, input.siteUrl, input.query);
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: url },
    openGraph: {
      type: input.openGraphType ?? "website",
      siteName: SITE_NAME,
      title: input.title,
      description: input.description,
      url,
    },
    twitter: { card: "summary", title: input.title, description: input.description },
    ...(input.noindex === true ? { robots: { index: false, follow: input.follow ?? true } } : {}),
  };
}

/**
 * True when a list-style page has any query parameter other than `page`
 * (filters, sort, search text). Such URLs are near-duplicates of the plain list.
 */
export function hasNonPageQuery(params: Record<string, string | string[] | undefined>): boolean {
  return Object.entries(params).some(([key, value]) => {
    if (key === "page") return false;
    return Array.isArray(value) ? value.some((v) => v !== "") : value !== undefined && value !== "";
  });
}

/** Page number from a raw `page` param, or null for 1 / invalid (canonical then omits it). */
export function canonicalPageQuery(rawPage: string | undefined): Record<string, string> | undefined {
  const page = Number.parseInt(rawPage ?? "", 10);
  return Number.isInteger(page) && page > 1 ? { page: String(page) } : undefined;
}

// ---------------------------------------------------------------- robots

/** `extraSitemapPaths` are the additional book sitemap files (see lib/seo/sitemap); /sitemap.xml is always listed. */
export function buildRobots(siteUrl: string, extraSitemapPaths: readonly string[] = []): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...DISALLOWED_PATHS] }],
    sitemap: ["/sitemap.xml", ...extraSitemapPaths].map((path) => absoluteUrl(path, siteUrl)),
  };
}

// ---------------------------------------------------------------- JSON-LD

export type JsonLdObject = Record<string, unknown>;

export type BookJsonLdInput = {
  slug: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  description: string | null;
  language: string;
  isbn13: string | null;
  edition: string | null;
  publisher: string | null;
  publishedYear: number | null;
  pageCount: number | null;
  license: { licenseUrl: string | null };
};

/** Only fields that exist in the catalogue data. No ratings, reviews, prices or availability are invented. */
export function buildBookJsonLd(book: BookJsonLdInput, siteUrl: string): JsonLdObject {
  const description = book.description?.replace(/\s+/g, " ").trim() ?? "";
  const licenseUrl = book.license.licenseUrl;
  return {
    "@context": "https://schema.org",
    "@type": "Book",
    "@id": canonicalUrl(`/book/${encodeURIComponent(book.slug)}`, siteUrl),
    url: canonicalUrl(`/book/${encodeURIComponent(book.slug)}`, siteUrl),
    name: book.title,
    ...(book.subtitle === null ? {} : { alternativeName: book.subtitle }),
    ...(book.authors.length === 0 ? {} : { author: book.authors.map((name) => ({ "@type": "Person", name })) }),
    ...(description === "" ? {} : { description }),
    inLanguage: book.language,
    ...(book.isbn13 === null ? {} : { isbn: book.isbn13 }),
    ...(book.edition === null ? {} : { bookEdition: book.edition }),
    ...(book.publisher === null ? {} : { publisher: { "@type": "Organization", name: book.publisher } }),
    ...(book.publishedYear === null ? {} : { datePublished: String(book.publishedYear) }),
    ...(book.pageCount === null ? {} : { numberOfPages: book.pageCount }),
    ...(licenseUrl !== null && licenseUrl.startsWith("https://") ? { license: licenseUrl } : {}),
  };
}

export type BreadcrumbItem = { name: string; path: string };

export function buildBreadcrumbJsonLd(items: readonly BreadcrumbItem[], siteUrl: string): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: canonicalUrl(item.path, siteUrl),
    })),
  };
}

/** JSON for an inline `<script type="application/ld+json">`: `<` and line separators are escaped so the payload cannot close the tag. */
export function serializeJsonLd(data: JsonLdObject): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
