# Decision: PDF reader, file proxy and guest state

Date: 2026-11-11. Status: accepted (proposal confirmed, hardened). Baseline `c6e855b` has no reader (2026-11-11). Related: [storage](decision-storage.md), [rights enforcement](decision-rights-enforcement.md), [testing](decision-testing.md), [architecture](../architecture.md).

## Decision

- Library: `pdfjs-dist`, exact-pinned. npm `latest` is 6.5.438 and 5.7.284 is the newest 5.x (both need Node >=22.13 for tooling, checked 2026-11-11). Start on 5.7.284 and move to 6.x only after a spike passes under Next 15. Custom thin viewer (canvas pages plus pdf.js `TextLayer`, virtualised page list, zoom, fit width, page jump, outline, text search, keyboard shortcuts), not a React wrapper library.
- Client-only: import pdf.js dynamically in a client component; server import fails because pdf.js expects browser globals.
- Self-hosted worker, cMaps and standard fonts at `/pdfjs/<version>/`, copied by `scripts/copy-pdfjs-assets.ts` into gitignored `public/pdfjs/`. CSP `worker-src 'self'`.
- Hardening: `isEvalSupported:false`; exact version pin; versions before 4.2.67 are affected by CVE-2024-4367 (arbitrary JS via crafted fonts); render only PDFs that passed upload validation.
- Same-origin file route (`/api/books/[slug]/file`): single `Range`, suffix ranges, 206, 416 with `Content-Range: bytes */size`, `If-Range`, `HEAD`, `Accept-Ranges: bytes`, `Content-Disposition: inline`, `nosniff`, ETag from sha256, `Cache-Control: private, max-age=0, must-revalidate`, `no-transform`. Multi-range requests receive a full 200. Disconnects abort via `request.signal`. A spike must confirm `next start` neither compresses nor drops `Content-Length`.
- Download route: `canDownload`, rate limit, `download_events` row (salted rotating IP hash, never raw IP), `Content-Disposition: attachment; filename*=UTF-8''...` from a sanitised title.

## Guest state

No public accounts. Bookmarks, reading progress, last-opened and preferences live in `localStorage` under a versioned key, validated with zod on read, size-capped, read through `useSyncExternalStore` (SSR-safe), with cross-tab `storage` events. Tables `bookmarks` and `reading_progress` exist (brief) keyed by an anonymous `reader_key`; server sync is off by default (`READER_SYNC=false`) and, if enabled, is rate-limited with payload caps. Privacy: no PII, no cookie banner needed for localStorage-only functional state (confirm with legal review).

## Risks (2026-11-11)

Large PDFs (hundreds of pages, scans) stress memory: render only visible pages, cap canvas pixel area, destroy pages off-screen. Serverless duration limits for streaming ([storage](decision-storage.md)). pdf.js 5.x and later use modern JS features; set a browser support statement (evergreen browsers) and consider the `legacy` build if required.

## Update 2026-11-11 (S1 dependency findings; working tree on top of `c6e855b`)

- **Pin changed to `pdfjs-dist` 6.5.438.** `npm audit` (2026-11-11) reports `>=5.6.83 <6.2.108` as high severity (arbitrary JavaScript execution when opening a malicious PDF, GHSA-hq66-cqwq-w95j), which includes 5.7.284; no fixed 5.x exists. The "start on 5.7.284" instruction above is superseded. 6.5.438 parses and extracts text from the generated fixtures under Node; browser rendering under Next 15 is still to be spiked in S4.
- `isEvalSupported` does not exist in 5.7.284 or 6.5.438 (the option name is absent from the package, 2026-11-11), so there is nothing to set; keep the exact pin and the upload validation instead.
- `PDFDocumentProxy.destroy()` is gone in 6.x; destroy the loading task. The package ships a `wasm/` directory next to `cmaps/` and `standard_fonts/`.
- `next start` 15.5.29 returns streamed and buffered route-handler responses with `Transfer-Encoding: chunked` and no `Content-Length` (also with `compress:false`), while `206`/`Content-Range`/`416` work. Rely on `Content-Range` for length; the "unmodified Content-Length" assumption in the S1 spike checklist does not hold.
