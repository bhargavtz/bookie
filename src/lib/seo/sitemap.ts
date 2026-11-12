/** Pure sitemap rules: who is included, how entries are built and how pages are split. */
import type { MetadataRoute } from "next";
import { canList, type BookRightsView } from "@/lib/policy";
import { absoluteUrl } from "./index";

/** Entries per sitemap file (the protocol limit is 50,000; smaller files are cheaper to generate). */
export const SITEMAP_PAGE_SIZE = 5000;

/** Static public pages that are always listed. Search is excluded on purpose (noindex). */
export const STATIC_SITEMAP_PATHS = ["/", "/library", "/category", "/collections", "/about", "/contact", "/copyright", "/licensing", "/privacy", "/takedown"] as const;

/**
 * A book is in the sitemap exactly when the rights policy lets a public viewer
 * list it: published, not deleted, approved or restricted licence that has not
 * expired, ready primary file. Removed, pending, expired and unpublished books
 * are excluded. (The database query applies the same rule; this check runs on
 * every returned row as a second gate.)
 */
export function isSitemapEligible(view: BookRightsView, now: Date): boolean {
  return canList({ kind: "public" }, view, now).allowed;
}

/** Number of sitemap files for the book count; always at least one (the static/taxonomy file is id 0). */
export function bookSitemapPageCount(totalBooks: number): number {
  return Math.ceil(Math.max(totalBooks, 0) / SITEMAP_PAGE_SIZE);
}

/**
 * `/sitemap.xml` (app/sitemap.ts) holds the static pages, categories, collections and the first
 * page of books. Book pages 2..N are served by `/sitemap-books/<n>.xml` (route handler).
 * Built without `generateSitemaps` because that API prerenders at build time, which would
 * open the database during `next build`.
 */
export function extraBookPages(totalBooks: number): number[] {
  return Array.from({ length: Math.max(bookSitemapPageCount(totalBooks) - 1, 0) }, (_, index) => index + 2);
}

export const extraBookPagePath = (page: number): string => `/sitemap-books/${page}.xml`;

/** Minimal sitemap XML for the route handler (the Next metadata API cannot express extra files). */
export function renderSitemapXml(entries: readonly { url: string; lastModified?: Date | string | undefined }[]): string {
  const escape = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const urls = entries
    .map((e) => `<url><loc>${escape(e.url)}</loc>${e.lastModified === undefined ? "" : `<lastmod>${escape(new Date(e.lastModified).toISOString())}</lastmod>`}</url>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`;
}

export function entry(path: string, siteUrl: string, lastModified?: Date): MetadataRoute.Sitemap[number] {
  return { url: absoluteUrl(path, siteUrl), ...(lastModified === undefined ? {} : { lastModified }) };
}
