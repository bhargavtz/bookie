# Environment variables

State described: working tree on top of `c6e855b`, 2026-11-12. Source of truth: `src/lib/env.ts` (zod schema, read only there through `getEnv()`); `.env.example` is the template.

**Secrets never go in the repository.** `.env*` is gitignored; only `.env.example` (placeholders) is tracked. Secrets are `DATABASE_URL` (contains a password), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `ADMIN_PASSWORD_HASH` and `IP_HASH_SALT`. Provide them through your host's secret store or an untracked env file. Validation errors name the variable and the reason, never the value. A blank value (as in a freshly copied `.env.example`) counts as "not set".

## Reference

| Variable | Required | Default | Purpose and rules |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development`, `test` or `production`. Production makes `IP_HASH_SALT` mandatory and uses the `__Host-` admin cookie name. |
| `SITE_URL` | no | `http://localhost:3000` | Public origin (http or https) for canonical URLs, sitemap and robots. Set it to your real https origin in production. |
| `CONTACT_EMAIL` | no | unset | Public address shown on Contact, Copyright and Licensing. Unset: those pages say no address is configured, the takedown form is not rendered and `POST /api/takedown` returns 503. Set it only to a monitored mailbox. |
| `DATABASE_URL` | production | unset | `postgres://` or `postgresql://` URL. Unset means embedded PGlite, which is for development and tests only. Production needs PostgreSQL 16 or newer (17+ recommended). Secret. |
| `DATABASE_POOL_MAX` | no | `10` | Pool size for `pg`, 1 to 100. Keep it small on serverless or pooled setups. |
| `PGLITE_DATA_DIR` | no | `.data/pglite` | PGlite data directory when `DATABASE_URL` is unset. One process per directory. |
| `STORAGE_DRIVER` | no | `local` | `local` or `s3`. |
| `STORAGE_LOCAL_DIR` | no | `.data/storage` | Directory for the local driver. Needs a persistent volume in production. |
| `S3_BUCKET` | when `s3` | unset | Bucket name, 3 to 63 characters. |
| `S3_REGION` | when `s3` | unset | Region (R2 accepts `auto`). |
| `S3_ENDPOINT` | no | unset | Custom endpoint URL for R2, MinIO and similar; leave unset for AWS S3. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | no | unset | Set both or neither. Neither means the AWS SDK default credential chain. Secrets. |
| `S3_FORCE_PATH_STYLE` | no | `false` | `true` or `1` for path-style addressing (MinIO and some others). |
| `DOWNLOAD_MODE` | no | `proxy` | `proxy` streams through the app (policy checked per request). `redirect` issues a presigned URL valid at most 60 seconds and requires `STORAGE_DRIVER=s3`. |
| `MAX_UPLOAD_BYTES` | no | `209715200` (200 MiB) | Maximum admin PDF upload, 1 byte to 5 GiB. Admin uploads are buffered in memory by the route, so size your host accordingly. |
| `ADMIN_EMAIL` | no | unset | Admin sign-in address. Set together with `ADMIN_PASSWORD_HASH` or not at all. |
| `ADMIN_PASSWORD_HASH` | no | unset | Output of `npm run admin:hash`, shape `scrypt$N$r$p$salt$hash`. Admin is disabled (404) when unset. Secret. |
| `IP_HASH_SALT` | production | unset | Random string of at least 16 characters, used to salt address hashes. The app refuses to start in production without it. Secret. |
| `TRUST_PROXY` | no | `false` | `true` or `1` only behind a proxy that overwrites `X-Forwarded-For`. Without it no client address is available, so address hashes are not recorded and per-client rate limits fall back to shared buckets. |
| `READER_SYNC` | no | `false` | Accepted by the schema, but no server-side sync route exists (2026-11-12). Leave it `false`. |

## Cross-variable rules (enforced at startup)

- `STORAGE_DRIVER=s3` requires `S3_BUCKET` and `S3_REGION`; `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` must be set together.
- `DOWNLOAD_MODE=redirect` requires `STORAGE_DRIVER=s3`.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` must be set together.
- `NODE_ENV=production` requires `IP_HASH_SALT`.

## Test-only variables

Read by tests, not by the app: `S3_TEST_ENDPOINT`, `S3_TEST_BUCKET`, `S3_TEST_REGION`, `S3_TEST_ACCESS_KEY_ID`, `S3_TEST_SECRET_ACCESS_KEY`, `S3_TEST_FORCE_PATH_STYLE` (real S3 contract run), and `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` (admin e2e). See [testing.md](testing.md).
