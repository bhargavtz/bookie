# Open decisions for the owner

Compiled 2026-11-12 from the working tree on top of `c6e855b` and the wiki. Each item names why it matters and a safe default. Nothing here has been decided by the documentation pass. Supersedes the shorter list in [architecture.md](architecture.md) section 6 (2026-11-11).

## Content and identity

1. **Category names.** The 15 reference categories in `src/server/db/reference/categories.ts` are placeholders chosen by the S1 stage because the project brief's list was unavailable (2026-11-11). Provide the real names, slugs and order. Rows that already exist are never overwritten by bootstrap, so a production database must be renamed in the admin.
2. **First real catalogue and rights evidence.** Who supplies titles, PDFs and the evidence for each? Until then the site is empty by design (no fake books). Decide who plays the reviewer role.
3. **Four deleted public images and their provenance.** `27669009_reading_05.jpg`, `7117804_3529668.jpg`, `na_feb_36.jpg`, `reading-book-illustration.jpg` were removed because rights were unknown (2026-11-11). Do you have licence proof to restore any, or should they stay deleted? Also decide whether to rewrite git history, which still contains them at `c6e855b`.
4. **Brand.** Keep the name "Bookie" and the indigo accent? Replace `src/app/favicon.ico` (origin unknown)? No share/OG image exists because no rights-cleared image source exists.
5. **Repository licence.** No LICENSE file exists. Choose one (or keep all rights reserved).

## Deployment and operations

6. **Deployment target.** A plain Node server is assumed ([wiki](wiki/deployment-node-server.md)). Confirm, or choose Vercel or another serverless host, which needs a direct-upload flow, S3 and a pooled database ([deployment.md](deployment.md)).
7. **Real PostgreSQL and real S3 verification.** Migrations and storage were tested only on PGlite and an in-process fake. Who runs them against the production providers, and when?
8. **TLS, HSTS and the reverse proxy.** Which proxy? Set HSTS there and choose `max-age`. Decide whether to trust `X-Forwarded-For` (`TRUST_PROXY`); also resolve the first-versus-last header inconsistency ([wiki](wiki/stage-s7b-production-docs.md), mismatch 1).
9. **CI and Docker.** None exist. Decide on CI (lint, typecheck, tests, build, `npm audit`) and a container image.
10. **Next 16 upgrade.** Deferred; `npm audit` still flags the `postcss` copy bundled in Next 15.5.29. Upgrade before or after launch?
11. **Backups and retention.** Backup schedule and restore drills; retention periods for `download_events`, hashed addresses, sessions and takedown personal data.
12. **Monitoring and takedown alerting.** No email notification of takedowns exists. Provide a monitored mailbox for `CONTACT_EMAIL` and decide on notifications.
13. **Security contact.** `SECURITY.md` points at the GitHub profile. Set up a dedicated security address?

## Legal review items

14. **Lawyer review** of every legal page (`src/app/(public)/_content/legal.ts`, marked `LEGAL REVIEW`): notice-and-takedown policy, designated agent, counter-notice, response times, disclaimers.
15. **Data protection**: lawful basis and retention for hashed addresses (daily-rotating, only with `TRUST_PROXY=true`) and takedown submissions (name, email, signature, statement); whether localStorage-only reader state needs consent wording in your jurisdictions.
16. **Terms of use.** `/terms` was planned and not built.
17. **Uploaded covers.** Admins can upload cover images; nothing records their provenance. Require evidence or generate covers only?
18. **Storage purge on takedown.** Removal keeps files as evidence; decide whether and when to delete objects.

## Admin product decisions

19. **Evidence URL field.** The licence form has Source URL, Licence URL and Evidence note; `canPublish` accepts source URL or evidence note. Should there be a separate required "evidence URL" (and should evidence be a stored file)?
20. **Rights filter on the admin Books list.** As of 2026-11-12 it filters only the loaded page. Add a repository-level filter so it works across pages?
21. **More admin users and roles.** Only the environment owner can sign in; editor and reviewer roles cannot be created. Add user management and two-factor authentication before a second person needs access?
22. **Technologies.** No way to create technologies; CSV and the book form reject unknown slugs. Provide a screen, bootstrap list or drop the field.
23. **Audit log screen and download statistics screen.** Planned; only an API exists for the audit log.

## Public product decisions

24. **Header search box.** The site header has no search box (only the home page and `/search`). Add one?
25. **Recently-uploaded timestamp.** "Recently added" sorts by publication date. Show an added/updated date on cards or book pages?
26. **Featured books.** Featured means "books of the first collection flagged featured"; confirm the editorial rule.
27. **Learning paths** are hard-coded category slugs in `src/components/home/learning-paths.ts`; confirm or provide the real paths (they disappear if the categories are renamed).
28. **Reader sync and accounts.** Keep guest-only localStorage, or build accounts? `READER_SYNC` is a dead flag today; remove it or implement it.
29. **Accessibility testing.** Add axe specs to e2e as the standards state? Also decide the supported browsers (pdf.js 6 needs evergreen browsers; Safari and Firefox were not tested).
30. **Upload size and flow.** Default 200 MiB, buffered in memory; confirm the limit and whether a direct-to-S3 upload is needed.
