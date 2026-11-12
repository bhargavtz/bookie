/**
 * Admin login, session validation and revocation. Pure of HTTP: callers pass
 * plain values and get plain results. All state is in the database
 * (`admin_users`, `admin_sessions`, `rate_limits`), so any instance can serve any request.
 */
import { adminLoginSchema } from "@/contracts/admin";
import type { AdminRole } from "@/contracts/enums";
import type { Db } from "@/server/db/client";
import {
  findAdminByEmail,
  findSessionByTokenHash,
  insertSession,
  recordLogin,
  revokeSessionByTokenHash,
  revokeSessionsForUser,
  touchSession,
  upsertBootstrapOwner,
} from "@/server/repositories/admin/auth";
import { verifyPassword } from "./password";
import type { RateLimiter, RateLimitRule } from "./rate-limit";
import { generateSessionToken, hashClientIp, hashKey, hashSessionToken } from "./tokens";

export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
/** Do not rewrite last_seen_at more often than this. */
const TOUCH_INTERVAL_MS = 60 * 1000;
/** 5 failed attempts per 15 minutes per client and per account. */
export const LOGIN_RATE_RULE: RateLimitRule = { limit: 5, windowSeconds: 15 * 60 };

export type BootstrapCredential = { email: string; passwordHash: string };

export type AuthDeps = {
  db: Db;
  limiter: RateLimiter;
  now: () => Date;
  /** From ADMIN_EMAIL / ADMIN_PASSWORD_HASH; null disables admin entirely (routes answer 404). */
  bootstrap: BootstrapCredential | null;
  /** Salt for IP and rate-limit key hashing. */
  salt: string;
};

export type AdminPrincipal = {
  userId: string;
  email: string;
  role: AdminRole;
  sessionId: string;
};

/** `ip` is null when the client address is unknown (no trusted proxy); then only the per-account limit applies, so one anonymous bucket cannot lock everyone out. */
export type LoginInput = { email: string; password: string; ip: string | null; userAgent: string | null };

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; principal: Omit<AdminPrincipal, "sessionId"> }
  | { ok: false; reason: "disabled" }
  | { ok: false; reason: "invalid_credentials" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number };

/** Coarse browser family only; the full user agent is never stored. */
export function uaFamily(userAgent: string | null): string | null {
  if (userAgent === null) return null;
  const families: ReadonlyArray<readonly [RegExp, string]> = [
    [/edg\//i, "edge"],
    [/firefox\//i, "firefox"],
    [/chrome\//i, "chrome"],
    [/safari\//i, "safari"],
  ];
  return families.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "other";
}

export async function login(deps: AuthDeps, input: LoginInput): Promise<LoginResult> {
  if (deps.bootstrap === null) return { ok: false, reason: "disabled" };
  const now = deps.now();

  const emailKey = input.email.trim().toLowerCase();
  const ipKey = input.ip === null ? null : `login:ip:${hashKey(input.ip, deps.salt)}`;
  const accountKey = `login:email:${hashKey(emailKey, deps.salt)}`;
  const [byClient, byAccount] = await Promise.all([
    ipKey === null ? Promise.resolve(null) : deps.limiter.hit(ipKey, LOGIN_RATE_RULE, now),
    deps.limiter.hit(accountKey, LOGIN_RATE_RULE, now),
  ]);
  if ((byClient !== null && !byClient.allowed) || !byAccount.allowed) {
    return {
      ok: false,
      reason: "rate_limited",
      retryAfterSeconds: Math.max(byClient?.retryAfterSeconds ?? 0, byAccount.retryAfterSeconds),
    };
  }

  const parsed = adminLoginSchema.safeParse({ email: input.email, password: input.password });
  // Always spend one hash verification so timing does not reveal whether the account exists.
  const candidateEmail = parsed.success ? parsed.data.email : emailKey;
  const isBootstrap = candidateEmail === deps.bootstrap.email.toLowerCase();
  const existing = isBootstrap ? null : await findAdminByEmail(deps.db, candidateEmail);
  const hashToCheck = isBootstrap ? deps.bootstrap.passwordHash : (existing?.passwordHash ?? deps.bootstrap.passwordHash);
  const passwordOk = await verifyPassword(input.password, hashToCheck);

  if (!parsed.success || !passwordOk || (!isBootstrap && (existing === null || !existing.isActive))) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const user = isBootstrap
    ? await upsertBootstrapOwner(deps.db, deps.bootstrap.email, deps.bootstrap.passwordHash)
    : existing;
  if (user === null) return { ok: false, reason: "invalid_credentials" };

  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MS);
  await insertSession(deps.db, {
    tokenHash: hashSessionToken(token),
    adminUserId: user.id,
    expiresAt,
    ipHash: input.ip === null ? null : hashClientIp(input.ip, deps.salt, now),
    uaFamily: uaFamily(input.userAgent),
    now,
  });
  await recordLogin(deps.db, user.id, now);
  await Promise.all([ipKey === null ? Promise.resolve() : deps.limiter.reset(ipKey), deps.limiter.reset(accountKey)]);
  return { ok: true, token, expiresAt, principal: { userId: user.id, email: user.email, role: user.role } };
}

/** Resolves a cookie token to a principal, or null when it is unknown, revoked, idle, expired or the user is inactive. */
export async function authenticateToken(deps: AuthDeps, token: string | null): Promise<AdminPrincipal | null> {
  if (token === null || token.length < 20 || token.length > 128) return null;
  const now = deps.now();
  const session = await findSessionByTokenHash(deps.db, hashSessionToken(token));
  if (session === null || session.revokedAt !== null || !session.user.isActive) return null;
  if (session.expiresAt.getTime() <= now.getTime()) return null;
  if (now.getTime() - session.lastSeenAt.getTime() > SESSION_IDLE_MS) return null;
  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) await touchSession(deps.db, session.sessionId, now);
  return { userId: session.user.id, email: session.user.email, role: session.user.role, sessionId: session.sessionId };
}

/** Server-side revocation (logout). Idempotent. */
export async function logout(deps: AuthDeps, token: string | null): Promise<void> {
  if (token === null) return;
  await revokeSessionByTokenHash(deps.db, hashSessionToken(token), deps.now());
}

/** For role change, deactivation or a takedown incident. */
export async function revokeAllSessions(deps: AuthDeps, adminUserId: string): Promise<number> {
  return revokeSessionsForUser(deps.db, adminUserId, deps.now());
}
