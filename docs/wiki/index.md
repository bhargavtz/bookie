# Bookie Wiki

Rules for this wiki: every claim carries a date (YYYY-MM-DD); claims about code cite a commit hash (baseline `c6e855b`); never write "currently" or "now" about code without a date or commit; link related pages; update this index when adding a page.

Last updated: 2026-11-12 (S7b production documentation; all feature stages present in the working tree on top of `c6e855b`, nothing committed; baseline hash for claims about the original code stays `c6e855b`).

| Page | Summary |
| --- | --- |
| [audit-2026-11-11.md](audit-2026-11-11.md) | Phase 1 audit of commit `c6e855b`: repo inventory, verified lint/typecheck/build results, vulnerabilities, accessibility and licensing findings, reference-site flow notes. |
| [decision-database.md](decision-database.md) | PostgreSQL + Drizzle ORM/drizzle-kit, node-postgres in prod, PGlite for dev/tests, Postgres FTS with pg_trgm; verified experiment and constraints. |
| [decision-storage.md](decision-storage.md) | One storage interface with local and S3-compatible drivers; proxy-first reads/downloads, short-lived presigned URLs only as an option, upload finalisation. |
| [decision-admin-auth.md](decision-admin-auth.md) | Env-configured scrypt admin credential, opaque DB-backed session cookie, role model, DB-backed rate limiting, CSRF stance. |
| [decision-rights-enforcement.md](decision-rights-enforcement.md) | Single server-side `canList/canRead/canDownload/canPublish` policy, licence state table, DB trigger, coverage tests. |
| [decision-reader-and-state.md](decision-reader-and-state.md) | pdfjs-dist self-hosted worker, same-origin range proxy, guest state in localStorage, reader hardening. |
| [decision-testing.md](decision-testing.md) | Vitest (unit/integration/components), Playwright + axe e2e, zod, generated test PDFs, PGlite per test file. |
| [decision-toolchain.md](decision-toolchain.md) | Version pins and changes: Next 15.5.29, ESLint 9, TypeScript 5.9, Node >=22.13, Tailwind 4 adoption, `next lint` replacement. |
| [stage-s1-foundation.md](stage-s1-foundation.md) | S1 implementation record: what was built, data-model decisions, spike results (PGlite under Next, Range, typegen), dependency findings (pdfjs-dist advisory), deviations, verification. |
| [stage-s4-reader.md](stage-s4-reader.md) | S4 implementation record: file/download routes with Range, rights enforcement and download events, client-only pdf.js reader, guest state, tests and what was browser-verified. |
| [stage-s3b-public-pages.md](stage-s3b-public-pages.md) | S3b implementation record: public routes, data/caching approach, featured and learning-path rules, book page actions, `CONTACT_EMAIL`. |
| [stage-s6-seo-legal.md](stage-s6-seo-legal.md) | S6 implementation record: metadata/canonical/noindex rules, database-backed sitemap and robots, JSON-LD, takedown form and route, legal copy review and corrections, security headers, deferred items. |
| [stage-closing-2026-11-12.md](stage-closing-2026-11-12.md) | Closing entries for S2 (catalogue and search), S3a (design system), S5a (admin backend), S5b (admin UI) and S7 (e2e), reconstructed from the working tree because those stages left no pages. |
| [stage-s7b-production-docs.md](stage-s7b-production-docs.md) | S7b record: documentation delivered, doc-code mismatches found (client address header handling, axe, dead `READER_SYNC`, technologies), what was not verified. |
| [deployment-node-server.md](deployment-node-server.md) | Deployment target decision (plain Node server, `next start`) and documented Vercel/serverless caveats for the PDF proxy. |

Operator and contributor docs (2026-11-12): [../setup.md](../setup.md), [../environment.md](../environment.md), [../database.md](../database.md), [../admin.md](../admin.md), [../deployment.md](../deployment.md), [../testing.md](../testing.md), [../open-questions.md](../open-questions.md), [../ASSETS.md](../ASSETS.md).

Related top-level docs: [../architecture.md](../architecture.md) (built versus planned in Part A, then the original plan, data model, stage plan), [../../CODING_STANDARDS.md](../../CODING_STANDARDS.md), [../../AGENTS.md](../../AGENTS.md).
