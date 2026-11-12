# Stage S7b: production documentation (implementation record)

Date: 2026-11-12. State described: working tree on top of `c6e855b`, nothing committed. Related: [stage closing entries](stage-closing-2026-11-12.md), [index](index.md), [../open-questions.md](../open-questions.md).

## Delivered (2026-11-12)

Rewritten: `README.md`, `CONTRIBUTING.md`; reviewed and updated: `SECURITY.md` (the old text said the repository had no authenticated backend, which stopped being true with the admin area), `docs/ASSETS.md`, `docs/architecture.md` (new Part A: built versus planned, 15 deviations), the wiki index and the admin-auth decision page. New: `docs/setup.md`, `docs/environment.md`, `docs/database.md`, `docs/admin.md`, `docs/deployment.md`, `docs/testing.md`, `docs/open-questions.md`, this page and [stage-closing-2026-11-12.md](stage-closing-2026-11-12.md). No application code or tests were edited, and `npm run verify` was not run because only documentation paths changed.

## Doc-code mismatches found (2026-11-12; not fixed, code is outside this stage)

1. **Client-address header handling differs.** `src/server/auth/client-ip.ts` (`getClientIp`, used by admin login and takedown) takes the **last** `X-Forwarded-For` entry and validates it with `isIP`; `src/server/http/client-info.ts` (`clientIp`, used for download events and download rate limits) takes the **first** entry without validation. The wiki ([deployment-node-server](deployment-node-server.md)) only says the proxy must overwrite the header. With an overwriting proxy both agree; behind an appending proxy the download path trusts a client-supplied value. Recommend one shared function.
2. **`CODING_STANDARDS.md` and `decision-testing` say axe runs in e2e.** No spec uses axe and `tests/a11y/` does not exist.
3. **`READER_SYNC` is accepted by `src/lib/env.ts` and `.env.example` but nothing reads it**; no `/api/reader` routes exist. `bookmarks` and `reading_progress` tables are unused.
4. **No technologies management.** Admin forms and the CSV import accept technology slugs that must already exist, but nothing creates rows in `technologies` (bootstrap seeds only categories; no admin screen or API). Imports that use a technology fail with "unknown technology".
5. **Architecture plan versus tree**: `robots.txt` disallows `/admin` and `/api/admin` only (plan said `/api`); `/terms` not built; audit log is API-only; no download statistics screen. Listed in [architecture Part A](../architecture.md).
6. **`AGENTS.md` stage table** still lists S7 as owning "README/CONTRIBUTING/SECURITY rewrite"; that was done by S7b. Harmless.
7. **Admin e2e spec** documents exporting `ADMIN_*` in the shell; `playwright.config.ts` does not set them, so the admin suite is skipped by default ([../testing.md](../testing.md)).
8. **Stray empty directories** `src/app/book/[id]`, `src/app/books`, `src/app/cart` (untracked, no files) remain from the old landing page.
9. `package.json` `name` is `bookie-nextjs`; cosmetic.

## Not verified

No deployment, no real PostgreSQL, no real S3, no e2e execution, no lawyer review. Statements about those in the new docs are taken from earlier dated wiki pages and are labelled as such.
