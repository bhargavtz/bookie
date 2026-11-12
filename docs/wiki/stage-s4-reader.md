# Stage S4: PDF reader and downloads (implementation record)

Date: 2026-11-11. State described: working tree on top of `c6e855b`, nothing committed. Related: [reader and state](decision-reader-and-state.md), [rights enforcement](decision-rights-enforcement.md), [storage](decision-storage.md), [S1 record](stage-s1-foundation.md).

## What exists (2026-11-11)

| Area | Files | Notes |
| --- | --- | --- |
| HTTP helpers | `src/server/http/{range,content-disposition,errors,client-info,file-response}.ts` | Single-range parser (206/416; multi-range, unknown units and malformed headers get a full 200), If-Range (strong ETag only), If-None-Match, RFC 6266/8187 filename builder, typed JSON errors, salted daily-rotating IP hash (never a raw IP; none without `TRUST_PROXY`). |
| File service | `src/server/services/files/{serve,reader-access,index}.ts` | `serveBookFile` runs the S1 policy (`canRead` for inline, `canDownload` for attachment) on every request, then `StorageDriver.stat/get`. Typed errors: `not_found` 404, `gone` 410, `forbidden` 403, `rate_limited` 429 (+ `Retry-After`), `range_not_satisfiable` 416, `asset_missing` 404, `storage_error` 502 (fixed messages; no keys, paths or driver text). |
| Repository | `src/server/repositories/book-files.ts` | Read model plus `download_events` writer (S2 owns the catalogue repository; this file is separate). |
| Routes | `src/app/api/books/[slug]/{file,download}/route.ts` | GET and HEAD. Inline: `Content-Disposition: inline`, no event, no rate limit (pdf.js issues many ranges). Download: attachment, rate limit (20 per 10 min per hashed client; coarse shared bucket without a trusted proxy), one `served` event per GET that starts at byte 0 (HEAD, resumed ranges, 416 and missing objects are not counted); denials write `denied_policy` / `denied_rate_limit`. |
| Reader page | `src/app/(public)/read/[slug]/page.tsx` | Server component, `canRead` via the service, `noindex`; 404/410/403 handled. |
| Client reader | `src/components/reader/*` | `pdfjs-dist` imported dynamically in the browser only; worker, CMaps, standard fonts, ICC and wasm served from `/pdfjs/<version>/` (copied by `scripts/copy-pdfjs-assets.mjs`, wired into `predev`/`prebuild`; output is gitignored). Lazy page rendering with canvas release off-screen and a 16 MP canvas cap, text layer, thumbnails, outline, document search, zoom, fit width/page, fullscreen, light/dark, bookmarks, restored position, keyboard shortcuts, password prompt, corrupt/network error with retry and an https-only external-source fallback link, loading skeleton and progress bar. |
| Guest state | `src/lib/reader-state/index.ts` | One versioned localStorage key, zod-validated, size-capped, try/catch everywhere; `useSyncExternalStore` binding in `src/components/reader/reader-store.ts`. |
| Tests | `tests/unit/{http-range,content-disposition,reader-state,reader-load-errors}.test.ts`, `tests/integration/file-routes.test.ts` | Integration tests call the real route handlers against PGlite + local storage and the generated fixtures. |

## Decisions and deviations

1. `pdfjs-dist` 6.x has no `isEvalSupported` option, so none is set (see the 2026-11-11 update in the reader decision page).
2. `Content-Length` is set but `next start` replaces it with chunked transfer (S1 spike); pdf.js gets the length from `Content-Range`.
3. Responses add `Content-Security-Policy: default-src 'none'; sandbox` and `X-Content-Type-Options: nosniff`; ETag is the stored sha256 (or asset id plus size when no hash exists); `Cache-Control: private, max-age=0, must-revalidate, no-transform`.
4. Server-side reader sync (`/api/reader/*`, `READER_SYNC`) is **not** built: no accounts exist and the flag is off by default; guest state is localStorage only.
5. Admin preview through these routes is wired for a `Viewer` but always passes the public viewer until S5a supplies sessions.
6. Edits outside S4's list: `package.json` (`predev`, `prebuild`, `assets:pdfjs` scripts), `scripts/copy-pdfjs-assets.mjs`, `src/server/repositories/book-files.ts`, this page and its index row.

## Verification (2026-11-11)

Unit and integration tests pass under `npm run verify`. A production build was started with a throwaway PGlite dir and local storage seeded from the generated fixtures and exercised in the Browser pane at 1200x800 and 375x812: pdf.js loaded the worker from the same origin and rendered pages, search found `lantern-orchard-12` and jumped to page 12, dark theme, mobile tools sheet, position restore after reload and the corrupt-PDF error with fallback link all worked. Not browser-tested: password-protected PDFs (no fixture; the code path uses pdf.js `onPassword`), fullscreen, outline (fixtures have none), touch gestures, Safari/Firefox.
