import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { DbRateLimiter } from "@/server/auth/rate-limit";
import { adminCookieName, serializeSessionCookie } from "@/server/auth/cookie";
import { AdminAuthError, requireAdmin, requireAdminSession } from "@/server/auth/guard";
import {
  authenticateToken,
  login,
  logout,
  revokeAllSessions,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  type AuthDeps,
} from "@/server/auth/session";
import { hashSessionToken } from "@/server/auth/tokens";
import type { DbHandle } from "@/server/db/client";
import { adminSessions, adminUsers, rateLimits } from "@/server/db/schema";
import { setAdminActive } from "@/server/repositories/admin/auth";
import { makeAuthDeps, TEST_SCRYPT } from "../helpers/admin";
import { createTestDb } from "../helpers/db";
import { insertAdmin } from "../helpers/factories";

let handle: DbHandle;
beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(async () => {
  await handle.close();
});

const T0 = new Date("2026-03-01T09:00:00Z");
const guardConfig = { cookieName: adminCookieName(false), siteOrigin: "https://bookie.test" };

async function setup(overrides: { email?: string; limiter?: AuthDeps["limiter"] } = {}) {
  let current = T0;
  const clock = { now: () => current, advance: (ms: number) => (current = new Date(current.getTime() + ms)) };
  const deps = await makeAuthDeps(handle.db, { ...overrides, now: clock.now });
  return { deps, clock };
}

const attempt = (deps: AuthDeps, password: string, email = deps.bootstrap?.email ?? "", ip: string | null = "203.0.113.5") =>
  login(deps, { email, password, ip, userAgent: "Mozilla/5.0 Chrome/120" });

function requestWith(token: string | null, init: { method?: string; origin?: string | null } = {}): Request {
  const headers = new Headers();
  if (token !== null) headers.set("cookie", serializeSessionCookie(guardConfig.cookieName, token, 60).split(";")[0] ?? "");
  if (init.origin !== null) headers.set("origin", init.origin ?? guardConfig.siteOrigin);
  return new Request("https://bookie.test/api/admin/books", { method: init.method ?? "GET", headers });
}

describe("login flow", () => {
  it("logs the bootstrap owner in, stores only a hash of the opaque token, and authenticates it", async () => {
    const { deps } = await setup({ email: "login-flow@example.test" });
    const result = await attempt(deps, deps.password);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.principal).toMatchObject({ email: "login-flow@example.test", role: "owner" });
    expect(result.expiresAt.getTime()).toBe(T0.getTime() + SESSION_ABSOLUTE_MS);

    const rows = await handle.db.select().from(adminSessions).where(eq(adminSessions.tokenHash, hashSessionToken(result.token)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toContain(result.token);
    expect(rows[0]?.uaFamily).toBe("chrome");
    expect(rows[0]?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows[0])).not.toContain("203.0.113.5");

    const principal = await authenticateToken(deps, result.token);
    expect(principal).toMatchObject({ email: "login-flow@example.test", role: "owner" });
  });

  it("answers wrong password, unknown account and malformed input identically and creates no session", async () => {
    const { deps } = await setup({ email: "identical@example.test" });
    const before = (await handle.db.select().from(adminSessions)).length;
    const results = [
      await attempt(deps, "wrong password!!", deps.email, "198.51.100.1"),
      await attempt(deps, deps.password, "nobody@example.test", "198.51.100.2"),
      await attempt(deps, "x", "not-an-email", "198.51.100.3"),
    ];
    expect(results).toEqual([
      { ok: false, reason: "invalid_credentials" },
      { ok: false, reason: "invalid_credentials" },
      { ok: false, reason: "invalid_credentials" },
    ]);
    expect((await handle.db.select().from(adminSessions)).length).toBe(before);
  });

  it("is disabled (no login possible) when no bootstrap credential is configured", async () => {
    const { deps } = await setup();
    const disabled: AuthDeps = { ...deps, bootstrap: null };
    expect(await attempt(disabled, deps.password, deps.email)).toEqual({ ok: false, reason: "disabled" });
  });

  it("lets a DB-backed non-bootstrap admin sign in, but not an inactive one", async () => {
    const { deps } = await setup({ email: "boot2@example.test" });
    const editor = await insertAdmin(handle.db, {
      email: "editor-login@example.test",
      role: "editor",
      passwordHash: await hashPassword("editor password 123", TEST_SCRYPT),
    });
    const ok = await attempt(deps, "editor password 123", editor.email, "198.51.100.10");
    expect(ok.ok && ok.principal.role).toBe("editor");
    await setAdminActive(handle.db, editor.id, false);
    expect(await attempt(deps, "editor password 123", editor.email, "198.51.100.11")).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("re-synchronises the bootstrap owner row with the environment hash", async () => {
    const { deps } = await setup({ email: "sync@example.test" });
    await attempt(deps, deps.password);
    const next = { ...deps, bootstrap: { email: deps.email, passwordHash: await hashPassword("rotated password 456", TEST_SCRYPT) } };
    expect((await attempt(next, "rotated password 456")).ok).toBe(true);
    const rows = await handle.db.select().from(adminUsers).where(eq(adminUsers.email, "sync@example.test"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.passwordHash).toBe(next.bootstrap.passwordHash);
  });
});

describe("login rate limiting (DB-backed)", () => {
  it("locks out after 5 failures per account, even for the correct password, then recovers in a new window", async () => {
    const { deps, clock } = await setup({ email: "limited@example.test", limiter: new DbRateLimiter(handle.db) });
    for (let i = 0; i < 5; i++) {
      expect(await attempt(deps, "wrong wrong wrong", deps.email, `192.0.2.${i + 1}`)).toEqual({ ok: false, reason: "invalid_credentials" });
    }
    const locked = await attempt(deps, deps.password, deps.email, "192.0.2.99");
    expect(locked).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(locked.ok === false && locked.reason === "rate_limited" && locked.retryAfterSeconds).toBeGreaterThan(0);

    const counters = await handle.db.select().from(rateLimits);
    expect(counters.some((r) => r.key.startsWith("login:email:"))).toBe(true);
    expect(counters.every((r) => !r.key.includes("limited@example.test") && !r.key.includes("192.0.2"))).toBe(true);

    clock.advance(16 * 60 * 1000);
    expect((await attempt(deps, deps.password, deps.email, "192.0.2.99")).ok).toBe(true);
  });

  it("also limits per client address across accounts", async () => {
    const { deps } = await setup({ email: "byip@example.test", limiter: new DbRateLimiter(handle.db) });
    for (let i = 0; i < 5; i++) await attempt(deps, "nope nope nope", `user${i}@example.test`, "192.0.2.200");
    expect(await attempt(deps, deps.password, deps.email, "192.0.2.200")).toMatchObject({ ok: false, reason: "rate_limited" });
    expect((await attempt(deps, deps.password, deps.email, "192.0.2.201")).ok).toBe(true);
  });

  it("a successful login clears the counters", async () => {
    const { deps } = await setup({ email: "reset@example.test", limiter: new DbRateLimiter(handle.db) });
    for (let i = 0; i < 3; i++) await attempt(deps, "wrong wrong wrong", deps.email, "192.0.2.150");
    expect((await attempt(deps, deps.password, deps.email, "192.0.2.150")).ok).toBe(true);
    for (let i = 0; i < 4; i++) expect(await attempt(deps, "wrong wrong wrong", deps.email, "192.0.2.150")).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("limits per account only when the client address is unknown", async () => {
    const { deps } = await setup({ email: "noip@example.test", limiter: new DbRateLimiter(handle.db) });
    for (let i = 0; i < 5; i++) await attempt(deps, "wrong wrong wrong", deps.email, null);
    expect(await attempt(deps, deps.password, deps.email, null)).toMatchObject({ reason: "rate_limited" });
  });
});

describe("sessions and revocation", () => {
  it("logout revokes server-side, so a copied cookie stops working", async () => {
    const { deps } = await setup({ email: "logout@example.test" });
    const result = await attempt(deps, deps.password);
    if (!result.ok) throw new Error("login failed");
    expect(await authenticateToken(deps, result.token)).not.toBeNull();
    await logout(deps, result.token);
    expect(await authenticateToken(deps, result.token)).toBeNull();
    const row = (await handle.db.select().from(adminSessions).where(eq(adminSessions.tokenHash, hashSessionToken(result.token))))[0];
    expect(row?.revokedAt).not.toBeNull();
    await expect(logout(deps, result.token)).resolves.toBeUndefined(); // idempotent
    await expect(logout(deps, null)).resolves.toBeUndefined();
  });

  it("revokes every session of a user (role change / incident) and rejects deactivated users", async () => {
    const { deps } = await setup({ email: "revokeall@example.test" });
    const a = await attempt(deps, deps.password);
    const b = await attempt(deps, deps.password);
    if (!a.ok || !b.ok) throw new Error("login failed");
    const principal = await authenticateToken(deps, a.token);
    expect(await revokeAllSessions(deps, principal?.userId ?? "")).toBe(2);
    expect(await authenticateToken(deps, a.token)).toBeNull();
    expect(await authenticateToken(deps, b.token)).toBeNull();

    const c = await attempt(deps, deps.password);
    if (!c.ok) throw new Error("login failed");
    await setAdminActive(handle.db, principal?.userId ?? "", false);
    expect(await authenticateToken(deps, c.token)).toBeNull();
  });

  it("expires after the idle timeout and the absolute lifetime; activity extends idle only", async () => {
    const { deps, clock } = await setup({ email: "expiry@example.test" });
    const result = await attempt(deps, deps.password);
    if (!result.ok) throw new Error("login failed");

    clock.advance(SESSION_IDLE_MS - 60_000);
    expect(await authenticateToken(deps, result.token)).not.toBeNull(); // touches last_seen
    clock.advance(SESSION_IDLE_MS - 60_000);
    expect(await authenticateToken(deps, result.token)).not.toBeNull(); // kept alive by activity
    clock.advance(SESSION_IDLE_MS + 60_000);
    expect(await authenticateToken(deps, result.token)).toBeNull(); // idle

    const second = await attempt(deps, deps.password);
    if (!second.ok) throw new Error("login failed");
    for (let elapsed = 0; elapsed < SESSION_ABSOLUTE_MS + 60_000; elapsed += SESSION_IDLE_MS - 60_000) {
      clock.advance(SESSION_IDLE_MS - 60_000);
      await authenticateToken(deps, second.token);
    }
    expect(await authenticateToken(deps, second.token)).toBeNull(); // absolute limit even with activity
  });

  it("rejects missing, short and unknown tokens", async () => {
    const { deps } = await setup();
    expect(await authenticateToken(deps, null)).toBeNull();
    expect(await authenticateToken(deps, "short")).toBeNull();
    expect(await authenticateToken(deps, "x".repeat(43))).toBeNull();
  });
});

describe("authorization guard", () => {
  it("answers 401 without a session, with a revoked one, and for a non-admin cookie value", async () => {
    const { deps } = await setup({ email: "guard@example.test" });
    const expectStatus = async (token: string | null, status: number) => {
      const error = await requireAdmin(deps, guardConfig, requestWith(token), "book.read").catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AdminAuthError);
      expect((error as AdminAuthError).status).toBe(status);
    };
    await expectStatus(null, 401);
    await expectStatus("A".repeat(43), 401);
    const result = await attempt(deps, deps.password);
    if (!result.ok) throw new Error("login failed");
    await logout(deps, result.token);
    await expectStatus(result.token, 401);
  });

  it("denies a signed-in non-admin role with 403 and admits the owner", async () => {
    const { deps } = await setup({ email: "guardrole@example.test" });
    const editor = await insertAdmin(handle.db, {
      email: "guard-editor@example.test",
      role: "editor",
      passwordHash: await hashPassword("editor password 123", TEST_SCRYPT),
    });
    const reviewer = await insertAdmin(handle.db, {
      email: "guard-reviewer@example.test",
      role: "reviewer",
      passwordHash: await hashPassword("reviewer password 123", TEST_SCRYPT),
    });
    const editorLogin = await attempt(deps, "editor password 123", editor.email, "198.51.100.21");
    const reviewerLogin = await attempt(deps, "reviewer password 123", reviewer.email, "198.51.100.22");
    const ownerLogin = await attempt(deps, deps.password, deps.email, "198.51.100.23");
    if (!editorLogin.ok || !reviewerLogin.ok || !ownerLogin.ok) throw new Error("login failed");

    const post = (token: string) => requestWith(token, { method: "POST" });
    const rejected = await requireAdmin(deps, guardConfig, post(editorLogin.token), "publication.approve").catch((e: unknown) => e);
    expect((rejected as AdminAuthError).status).toBe(403);
    expect((rejected as AdminAuthError).code).toBe("forbidden");
    expect(await requireAdmin(deps, guardConfig, post(editorLogin.token), "book.write")).toMatchObject({ role: "editor" });

    const reviewerDenied = await requireAdmin(deps, guardConfig, post(reviewerLogin.token), "asset.upload").catch((e: unknown) => e);
    expect((reviewerDenied as AdminAuthError).status).toBe(403);
    expect(await requireAdmin(deps, guardConfig, post(reviewerLogin.token), "publication.approve")).toMatchObject({ role: "reviewer" });

    expect(await requireAdmin(deps, guardConfig, post(ownerLogin.token), "publication.approve")).toMatchObject({ role: "owner" });
    expect(await requireAdminSession(deps, guardConfig, requestWith(editorLogin.token))).toMatchObject({ role: "editor" });
  });

  it("rejects mutating requests without a matching Origin before looking at the session", async () => {
    const { deps } = await setup({ email: "origin@example.test" });
    const result = await attempt(deps, deps.password);
    if (!result.ok) throw new Error("login failed");
    for (const origin of [null, "https://evil.test"]) {
      const error = await requireAdmin(deps, guardConfig, requestWith(result.token, { method: "POST", origin }), "book.write").catch((e: unknown) => e);
      expect(error).toMatchObject({ status: 403, code: "bad_origin" });
    }
  });

  it("answers 404 for everything when admin is not configured", async () => {
    const { deps } = await setup();
    const disabled: AuthDeps = { ...deps, bootstrap: null };
    const error = await requireAdmin(disabled, guardConfig, requestWith(null), "book.read").catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 404, code: "admin_disabled" });
  });
});
