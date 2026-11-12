import { describe, expect, it } from "vitest";
import { getClientIp } from "@/server/auth/client-ip";
import { adminCookieName, readCookie, serializeClearedCookie, serializeSessionCookie } from "@/server/auth/cookie";
import { AdminAuthError, assertSameOrigin } from "@/server/auth/guard";
import { hashPassword, parsePasswordHash, verifyPassword } from "@/server/auth/password";
import { ADMIN_ACTIONS, can } from "@/server/auth/permissions";
import { generateSessionToken, hashClientIp, hashSessionToken } from "@/server/auth/tokens";
import { loadEnv } from "@/lib/env";
import { TEST_SCRYPT } from "../helpers/admin";

describe("password hashing", () => {
  it("round-trips and uses the env-compatible format", async () => {
    const stored = await hashPassword("a long enough passphrase", TEST_SCRYPT);
    expect(stored).toMatch(/^scrypt\$1024\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    // Must be accepted by the same regex that validates ADMIN_PASSWORD_HASH.
    expect(() => loadEnv({ ADMIN_EMAIL: "a@example.test", ADMIN_PASSWORD_HASH: stored })).not.toThrow();
    expect(await verifyPassword("a long enough passphrase", stored)).toBe(true);
  });

  it("rejects a wrong password, a changed password and unicode-equivalent passwords are normalised", async () => {
    const stored = await hashPassword("pässword-with-ünicode", TEST_SCRYPT);
    expect(await verifyPassword("password-with-unicode", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
    expect(await verifyPassword("pa\u0308ssword-with-ünicode", stored)).toBe(true); // NFC/NFD
  });

  it("uses a fresh salt per hash", async () => {
    const a = await hashPassword("same password", TEST_SCRYPT);
    const b = await hashPassword("same password", TEST_SCRYPT);
    expect(a).not.toBe(b);
  });

  it.each([
    "",
    "plain-text",
    "scrypt$1024$8$1$c2FsdA$aGFzaA", // salt and hash too short
    "scrypt$1000$8$1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2g", // N not a power of two
    "scrypt$1073741824$8$1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2g", // N far above the cap
    "bcrypt$1024$8$1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2g",
  ])("treats malformed stored hash %j as a failed verification, not an error", async (stored) => {
    expect(parsePasswordHash(stored)).toBeNull();
    expect(await verifyPassword("anything", stored)).toBe(false);
  });

  it("refuses to create a hash with invalid parameters", async () => {
    await expect(hashPassword("x", { N: 1000, r: 8, p: 1 })).rejects.toThrow(RangeError);
  });
});

describe("role permissions", () => {
  it("owner can do everything", () => {
    for (const action of ADMIN_ACTIONS) expect(can("owner", action)).toBe(true);
  });
  it("editor edits content but cannot approve rights, publish or handle takedowns", () => {
    expect(can("editor", "book.write")).toBe(true);
    expect(can("editor", "asset.upload")).toBe(true);
    expect(can("editor", "license.edit")).toBe(true);
    for (const action of ["license.review", "publication.approve", "takedown.manage", "audit.read"] as const) {
      expect(can("editor", action)).toBe(false);
    }
  });
  it("reviewer decides rights and takedowns but cannot edit files or content", () => {
    for (const action of ["license.review", "publication.approve", "takedown.manage"] as const) {
      expect(can("reviewer", action)).toBe(true);
    }
    for (const action of ["book.write", "book.delete", "asset.upload", "import.run", "taxonomy.manage"] as const) {
      expect(can("reviewer", action)).toBe(false);
    }
  });
  it("denies an unknown role", () => {
    expect(can("visitor" as never, "book.read")).toBe(false);
  });
});

describe("session tokens and cookies", () => {
  it("generates unguessable distinct tokens and stores only a sha256", () => {
    const a = generateSessionToken();
    expect(a).not.toBe(generateSessionToken());
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashSessionToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(a)).not.toContain(a);
  });
  it("hashes IPs with a salt that rotates daily", () => {
    const day1 = hashClientIp("203.0.113.9", "salt", new Date("2026-01-01T10:00:00Z"));
    expect(day1).toBe(hashClientIp("203.0.113.9", "salt", new Date("2026-01-01T23:00:00Z")));
    expect(day1).not.toBe(hashClientIp("203.0.113.9", "salt", new Date("2026-01-02T00:00:01Z")));
    expect(day1).not.toContain("203.0.113.9");
  });
  it("serialises HttpOnly, Secure, SameSite=Strict cookies", () => {
    const set = serializeSessionCookie(adminCookieName(true), "tok", 3600);
    expect(set).toBe("__Host-bookie_admin=tok; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Strict");
    expect(serializeClearedCookie("c")).toContain("Max-Age=0");
    expect(adminCookieName(false)).toBe("bookie_admin");
  });
  it("reads one cookie from a header", () => {
    expect(readCookie("a=1; bookie_admin=xyz; b=2", "bookie_admin")).toBe("xyz");
    expect(readCookie("a=1", "bookie_admin")).toBeNull();
    expect(readCookie(null, "bookie_admin")).toBeNull();
    expect(readCookie("bookie_admin=", "bookie_admin")).toBeNull();
  });
});

describe("client ip", () => {
  it("ignores headers unless the proxy is trusted", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "198.51.100.7" }), false)).toBeNull();
  });
  it("uses the last forwarded entry (the trusted proxy's), not a client-supplied first one", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 198.51.100.7" }), true)).toBe("198.51.100.7");
  });
  it("rejects garbage", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "not-an-ip" }), true)).toBeNull();
    expect(getClientIp(new Headers(), true)).toBeNull();
  });
});

describe("assertSameOrigin", () => {
  const config = { cookieName: "c", siteOrigin: "https://bookie.example" };
  const req = (method: string, headers: Record<string, string>) => new Request("https://bookie.example/api/admin/x", { method, headers });

  it("does not check safe methods", () => {
    expect(() => assertSameOrigin(req("GET", {}), config)).not.toThrow();
  });
  it("accepts the site origin or the Host", () => {
    expect(() => assertSameOrigin(req("POST", { origin: "https://bookie.example" }), config)).not.toThrow();
    expect(() => assertSameOrigin(req("POST", { origin: "http://localhost:3000", host: "localhost:3000" }), config)).not.toThrow();
  });
  it("rejects a missing or foreign origin with 403", () => {
    const cases: Record<string, string>[] = [{}, { origin: "https://evil.example", host: "bookie.example" }, { origin: "null" }];
    for (const headers of cases) {
      try {
        assertSameOrigin(req("POST", headers), config);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(AdminAuthError);
        expect((error as AdminAuthError).status).toBe(403);
      }
    }
  });
});
