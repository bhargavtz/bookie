# Decision: admin authentication

Date: 2026-11-11. Status: accepted (proposal confirmed, session mechanism changed). Baseline `c6e855b` has no auth (2026-11-11). Related: [rights enforcement](decision-rights-enforcement.md), [database](decision-database.md), [architecture](../architecture.md).

## Decision

- Admin credential is configured by environment: `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` (format `scrypt$N$r$p$salt$hash`). There is no default password; if unset, admin routes return 404. A script `npm run admin:hash` reads the password from a prompt or stdin (never argv) and prints only the hash. `.env*` stay gitignored (verified in `.gitignore` at `c6e855b`, 2026-11-11); only `.env.example` with placeholders is committed.
- Hashing with `node:crypto` `scrypt` (no dependency) at N=2^17, r=8, p=1 (OWASP minimum for scrypt), `maxmem` raised, benchmark before fixing; constant-time compare with `timingSafeEqual`; run a dummy hash when the user does not exist.
- Sessions (changed): an opaque random 32-byte token in an httpOnly cookie, stored as sha256 in `admin_sessions`, instead of a signed cookie. Reason: revocable (logout, role change, takedown incident) and there is no signing secret to leak or rotate. Cookie: `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`; `__Host-` name prefix in production only (browsers differ on Secure cookies over http localhost). Idle timeout 30 minutes, absolute 8 hours.
- The bootstrap admin from env is upserted into `admin_users` with role `owner` at login; the DB row follows the env hash. The role enum (`owner`, `editor`, `reviewer`) and a single `can(role, action)` map exist from day one so more admins can be added later.
- Rate limiting: DB-backed `rate_limits` table (works across instances) keyed by hashed client IP and by lower-cased email: 5 failures per 15 minutes then lockout with identical error messages. Public endpoints (search, download, takedown) use the same `RateLimiter` interface with an in-memory implementation as fallback.
- CSRF: `SameSite=Strict` cookie, `Origin` header check on mutating requests, JSON bodies only; Next Server Actions additionally compare Origin and Host.
- Edge middleware can only check cookie presence (scrypt and DB are Node-only); real authorisation is in `requireAdmin(action)` inside every handler and layout.

## Risks (2026-11-11)

- Single shared env credential until more admin users are built; mitigate with owner-only account management later and audit logging ([architecture](../architecture.md) `audit_log`).
- scrypt at N=2^17 uses about 128 MB per hash; may be heavy on small serverless functions; tune N and `maxmem` per host.
- Client IP depends on proxy headers; add a `TRUST_PROXY` setting and never trust `X-Forwarded-For` blindly.
- No 2FA in scope; recommend adding TOTP before multi-admin use.

## Update 2026-11-11 (S1 implemented; working tree on top of `c6e855b`)

S1 delivered the shared pieces only: `admin_users` and `admin_sessions` tables (token stored as a sha256 hex CHECK-constrained column, lower-case email CHECK) and the `RateLimiter` interface with `DbRateLimiter` (atomic `INSERT ... ON CONFLICT DO UPDATE`, fixed windows, tested for concurrency) and `MemoryRateLimiter`, in `src/server/auth/rate-limit.ts`. Env validation requires `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` together and checks the `scrypt$N$r$p$salt$hash` shape without logging values. The `admin:hash` script is not implemented (S5a needs the orchestrator to allow a change under `scripts/**`). Hashing, sessions and `requireAdmin` are S5a.

## Update 2026-11-12 (S5a and S5b present; working tree on top of `c6e855b`)

The S1 note above that `admin:hash`, hashing, sessions and `requireAdmin` were not built is superseded: `scripts/admin-hash.ts` (`npm run admin:hash`, hidden prompt or stdin, minimum 12 characters), `src/server/auth/{password,session,guard,cookie,permissions,client-ip}.ts` and the admin routes and UI exist in the working tree. Verified by reading the code on 2026-11-12: scrypt N=2^17, r=8, p=1; sessions idle 30 minutes and absolute 8 hours; login limit 5 failures per 15 minutes per client address (only with `TRUST_PROXY=true`) and per account; roles `owner` (all), `editor` (content, files, draft licence evidence; no rights approval, no publish, no takedowns) and `reviewer` (rights, publish, takedowns, audit; no content or file edits). Only the environment-configured owner can sign in; no user-management path exists, and there is no 2FA. Usage: [../admin.md](../admin.md). Not re-run by the documentation pass.
