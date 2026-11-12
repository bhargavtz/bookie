# Security Policy

Reviewed 2026-11-12 against the working tree on top of `c6e855b`.

## Supported versions

Bookie has no tagged releases. Security fixes are considered for the default branch only.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Contact the maintainer privately through the email address listed on the maintainer's GitHub profile: [@Bhargavtz](https://github.com/Bhargavtz). (A dedicated security contact address has not been set up; see [docs/open-questions.md](docs/open-questions.md).)

Include a concise description and impact, reproduction steps or a minimal proof of concept, the affected route, commit or dependency, and any suggested mitigation. Do not include real credentials or personal data. Allow reasonable time for assessment and remediation before public disclosure.

Copyright or rights complaints about a book are **not** security reports. Use the takedown form at `/takedown` on a running site.

## What the application does (as built, 2026-11-12)

- Rights: no list, read, download or publish without the server-side policy; database triggers guard publishing; defaults deny.
- Admin: disabled unless `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` (scrypt) are set; opaque random session tokens stored hashed and revocable; `HttpOnly`, `Secure`, `SameSite=Strict` cookie; 30-minute idle and 8-hour absolute lifetimes; `Origin` check on mutating requests; login rate limiting; role-based permissions; audit log for rights and publish changes.
- Uploads: size limit, `%PDF-` header and `%%EOF` checks, sha256, covers detected from bytes; storage keys are server-generated and opaque.
- Operator-supplied URLs must be https and not private, loopback, link-local or metadata addresses, and are stored, never fetched.
- Privacy: no raw client addresses are stored (salted, daily-rotating hash, only when `TRUST_PROXY=true`); no third-party scripts.
- Headers: CSP, `nosniff`, `X-Frame-Options: DENY`, referrer and permissions policies. HSTS is not set by the app.
- Secrets: never committed; `.env*` is gitignored; environment errors name variables, never values.

## Known limitations

- CSP allows `'unsafe-inline'` scripts (Next.js bootstrap); no nonce.
- No two-factor authentication; one shared environment-configured admin credential.
- No HSTS, CI, dependency-update automation or WAF in the repository. `npm audit` (2026-11-11) still flagged the `postcss` copy bundled in Next 15.5.29 and dev-only packages; re-run `npm audit` before each release.
- Rate limits are fixed-window and best effort; without `TRUST_PROXY=true` per-client limits share buckets.
- The local storage driver trusts its directory against concurrent local attackers.
- No penetration test or external security review has been done. Legal pages are drafts awaiting legal review.
- Real PostgreSQL and real S3 endpoints were not tested (2026-11-11).

See [docs/deployment.md](docs/deployment.md) for what is not yet configured in production.
