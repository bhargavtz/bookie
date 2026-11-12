# Decision: toolchain and versions

Date: 2026-11-11. Status: accepted (new). Evidence: [audit](audit-2026-11-11.md) (commit `c6e855b`). Related: [testing](decision-testing.md), [database](decision-database.md), [architecture](../architecture.md).

## Decisions

1. Next.js: upgrade 15.3.8 to 15.5.29 (npm `backport` tag, 2026-11-11). Reason: `npm audit` on the lockfile at `c6e855b` reports Next as critical and lists 15.5.29 as the non-major fix (2026-11-11). React stays 19 (lockfile 19.1.0; use latest 19.2.x on upgrade). Next 16 (`latest` is 16.4.6, 2026-11-11) is deferred to a separate, post-S7 upgrade; it removes `next lint`.
2. Lint: replace `next lint` with `eslint .` using the existing flat config. Reason: `next lint` broke on the developer's installed Next 16.2.11 (2026-11-11) and is deprecated in 15.5. Keep ESLint 9.x (npm: `eslint@9` is 9.39.5; `eslint-config-next@15.5.29` peers support ESLint up to 9). Do not adopt ESLint 10.14.0 yet.
3. TypeScript: stay on 5.9.x. npm `latest` is 7.0.2 (2026-11-11), not validated with Next 15 or typescript-eslint. Add `noUncheckedIndexedAccess` and `noImplicitOverride`. Run `next typegen` before `tsc` so stale `.next/types` cannot fail the typecheck (3 such errors observed 2026-11-11).
4. Node: `engines.node >=22.13`, `.nvmrc` 24. Vitest 5.1 needs `^22.12 || ^24 || >=26`; pdfjs-dist 5.7+ needs `>=22.13 || >=24`. Audit machine runs Node 26.9.0. Bump `@types/node` to ^22 (lockfile has 20.19.0 at `c6e855b`).
5. Tailwind 4 is installed at `c6e855b` but unused. Adopt it in S3a via `@import "tailwindcss"` and `@theme` tokens, or remove it; recommendation is adopt.
6. GSAP: keep for the marketing homepage only, scoped with `gsap.context`, reduced-motion aware.
7. Environment drift guard: `scripts/check-env.mjs` in `npm run verify` compares installed `next` with the lockfile and fails with "run npm ci".
8. Exact pins for risky libraries: `pdfjs-dist`, `drizzle-orm`, `drizzle-kit`, `@electric-sql/pglite`, `vitest`.

## Versions verified on npm, 2026-11-11

next 16.4.6 (latest) / 15.5.29 (backport), react 19.3.1, drizzle-orm 0.45.4, drizzle-kit 0.31.11, pg 8.23.1, @electric-sql/pglite 0.5.16, @aws-sdk/client-s3 3.1166.0, pdfjs-dist 6.5.438 (5.7.284 newest 5.x), vitest 5.1.0, @playwright/test 1.65.0, @axe-core/playwright 4.14.0, zod 4.6.7, csv-parse 7.0.3, tsx 4.23.15, tailwindcss 4.3.5, gsap 3.15.1, eslint 9.39.5 (10.14.0 exists), typescript 5.9.3 (7.0.2 exists). Re-check before pinning in S1; compatibility with Next 15.5.29 and React 19 is expected but only the PGlite/Drizzle behaviour was exercised on 2026-11-11.

## Update 2026-11-11 (S1 implemented; working tree on top of `c6e855b`)

Details in [stage-s1-foundation](stage-s1-foundation.md). Done: node_modules reinstalled from scratch; `next` 15.5.29 and `eslint-config-next` 15.5.29; `lint` is `eslint .`; `engines.node >=22.13`, `.nvmrc` 24; `@types/node` ^22 (22.20.5); `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch` added; `npm run verify` = env check, lint, typecheck, tests (build is separate). Corrections to this page: (1) `next typegen` does not remove stale route types, so `npm run typecheck` deletes `.next/types` first; (2) Tailwind adoption is S3a's (it owns `globals.css`) and was not done in S1; (3) the `^` ranges on existing dependencies resolved to react/react-dom 19.3.1, tailwindcss 4.3.5 and gsap 3.15.1 during the clean install; (4) `next build` also runs ESLint, so lint rules gate builds; (5) the `postcss` copy bundled in Next 15.5.29 is still flagged by `npm audit` and is only fixed by Next 16 (deferred as decided above).
