# Stage closing entries: S2, S3a, S5a, S5b, S7 (2026-11-12)

Date: 2026-11-12. State described: working tree on top of `c6e855b` (branch `new-code-set`, nothing committed). Why this page exists: S1, S3b, S4 and S6 wrote their own records ([S1](stage-s1-foundation.md), [S3b](stage-s3b-public-pages.md), [S4](stage-s4-reader.md), [S6](stage-s6-seo-legal.md)); S2, S3a, S5a, S5b and S7 did not leave stage pages in `docs/wiki/`. These entries are reconstructed by the S7b documentation pass from files present in the working tree on 2026-11-12 (file listings and reading the code). They record what exists, not what was verified by running it; no command was run by S7b (documentation only). Plan: [../architecture.md](../architecture.md) Part A and section 5.

## S2: catalogue and search

Exists (2026-11-12): `src/server/repositories/catalogue/{books,filters,index,predicate,search-text,suggestions,taxonomy,types}.ts`; `src/server/services/{catalogue,search}/`; `src/lib/search/`; `src/app/api/search/route.ts`, `src/app/api/search/autocomplete/route.ts`, `src/app/api/catalogue/{books,books/[slug],categories,categories/[slug],collections,collections/[slug],popular,recent}`. Sorting in `books.ts` supports relevance, popularity (download count), newest (`published_at` then `created_at`) and others. Tests: `tests/integration/catalogue.test.ts`, `catalogue-fixtures.ts` (helper), `tests/unit/{catalogue-http,search-lib}.test.ts`. The home page "Recently added" shelf sorts by `published_at`; there is no "uploaded at" timestamp shown ([../open-questions.md](../open-questions.md)).

## S3a: design system

Exists: `src/styles/`, `src/components/{ui,layout}/` (header, footer, skip link, navigation), `src/app/layout.tsx`, `src/app/globals.css`; `docs/ASSETS.md`; unknown-rights images and dead SVGs removed from `public/` (shown as deleted in git status, 2026-11-12). Header has no search box (the search box is on the home page and `/search`; verified by grep of `SiteHeader.tsx`, 2026-11-12). Tests: `tests/unit/ui-{cover-palette,navigation,tilt}.test.ts`.

## S5a: admin backend

Exists: `src/server/auth/{client-ip,cookie,guard,password,permissions,rate-limit,session,tokens}.ts`; `src/server/services/admin/*` (books, assets, licenses, imports, duplicates, stats, takedowns, taxonomy, upload validation); `src/server/repositories/admin/*`; `src/lib/csv/{parse,rows,index}.ts`; 27 `route.ts` handlers under `src/app/api/admin/`; `scripts/admin-hash.ts` (`npm run admin:hash`), which resolves the "not implemented" note in [decision-admin-auth](decision-admin-auth.md). Behaviour is documented in [../admin.md](../admin.md). Tests: `tests/integration/admin-{auth,books,import,stats-taxonomy}.test.ts`, `tests/unit/admin-*.test.ts` (including `admin-route-inventory.test.ts`). Observed gaps (2026-11-12): no technology create/edit screen or API, no additional admin user creation, audit log has an API only.

## S5b: admin UI

Exists: `src/app/admin/{login,(protected)/...,_lib}`, `src/components/admin/*` (login, shell, nav, book form, licence form, publish panel, upload form, import form, takedown manager, entity manager). The Books list rights filter is applied after pagination to the current page only (comment in `src/app/admin/(protected)/books/page.tsx`: "The list service has no rights filter"). Licence form fields are source URL, licence URL, attribution, evidence note and flags; there is no separate "evidence URL" field ([../open-questions.md](../open-questions.md)). Admin route headers: `X-Robots-Tag` via `next.config.ts` (S6); no `<meta robots>` in admin pages.

## S7: e2e and tests

Exists: `tests/e2e/public-pages.spec.ts` and `tests/e2e/admin.spec.ts`; `playwright.config.ts` (port 3100, `.data/e2e`, projects desktop and mobile, one worker). No `tests/a11y/` and no axe usage (grep, 2026-11-12) although `@axe-core/playwright` is installed. Skips: the admin spec without `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`; the book-detail spec when no published book exists (nothing is seeded); the real-S3 contract block without `S3_TEST_ENDPOINT` and `S3_TEST_BUCKET`. See [../testing.md](../testing.md). No record of a passing `npm run e2e` was found in the wiki.

## Verified in this pass

Only by reading: file existence, route counts (27 admin route files, 40 route files under `src/app/api`, 2026-11-12), test file counts (27 unit, 11 integration files). Not re-run: `npm run verify`, build, e2e, db scripts.
