# Stage S3b: public pages (implementation record)

Date: 2026-11-11, working tree on top of `c6e855b`.

- Routes (`src/app/(public)`): `/`, `/library`, `/search`, `/category`, `/category/[slug]`, `/collections`, `/collections/[slug]`, `/book/[slug]`, `/about`, `/contact`, `/copyright`, `/licensing`, `/privacy`; `src/app/not-found.tsx`. The legacy landing page and its seven components were deleted.
- Data: pages call the S2 catalogue service only (`src/app/(public)/_lib/data.ts`). Pages render per request (`connection()`), so `next build` never opens the database. Shared shelves (categories, collections, recent, popular, featured collection books) use `unstable_cache` with a 60 s revalidate; book detail and filtered lists are uncached so takedowns show on the next request.
- Featured books = the books of the first collection flagged `isFeatured`; none flagged shows an empty state. Learning paths (`src/components/home/learning-paths.ts`) hold only category slugs; names, links and counts come from the database and missing categories are dropped.
- Book page buttons: Read online only when `canRead`, Download PDF only when `canDownload` (both from the policy via the service). Bookmark uses localStorage key `bookie:book-bookmarks:v1`. "What you will learn" is not rendered: the catalogue DTO has no such field.
- Search: `SearchBox` (client) uses `useAutocomplete`; `/` and Ctrl/Cmd+K focus it. Filters are a GET form; the author field takes a name and is slugified to the catalogue's author slug.
- Contact address: optional env `CONTACT_EMAIL` (added to `src/lib/env.ts` and `.env.example`, an S1-owned edit made at the orchestrator's request). Unset: the pages say no address is configured. `/contact`, `/copyright`, `/licensing` therefore render per request.
- `/takedown` (S6) is linked from the footer, book pages and legal pages; it did not exist at S3b time. Legal text needs human review before launch.
- Tests: `tests/unit/public-pages.test.ts`; `tests/e2e/public-pages.spec.ts` (written, not executed in S3b).
