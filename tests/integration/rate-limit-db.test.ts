import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbRateLimiter } from "@/server/auth/rate-limit";
import type { DbHandle } from "@/server/db/client";
import { createTestDb } from "../helpers/db";

let handle: DbHandle;
beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(async () => {
  await handle.close();
});

const rule = { limit: 3, windowSeconds: 900 };
const t0 = new Date("2026-01-01T00:05:00Z");

describe("DbRateLimiter", () => {
  it("counts hits per window and blocks over the limit", async () => {
    const rl = new DbRateLimiter(handle.db);
    const out = [];
    for (let i = 0; i < 5; i++) out.push(await rl.hit("login:ip:abc", rule, t0));
    expect(out.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(out[3]?.retryAfterSeconds).toBe(600);
    expect(out[3]?.resetAt.toISOString()).toBe("2026-01-01T00:15:00.000Z");
  });

  it("is concurrency-safe (atomic upsert)", async () => {
    const rl = new DbRateLimiter(handle.db);
    const results = await Promise.all(Array.from({ length: 10 }, () => rl.hit("concurrent", { limit: 4, windowSeconds: 60 }, t0)));
    expect(results.filter((r) => r.allowed)).toHaveLength(4);
  });

  it("new window resets the count; keys are isolated; reset clears", async () => {
    const rl = new DbRateLimiter(handle.db);
    for (let i = 0; i < 4; i++) await rl.hit("k1", rule, t0);
    expect((await rl.hit("k2", rule, t0)).allowed).toBe(true);
    expect((await rl.hit("k1", rule, new Date("2026-01-01T00:15:00Z"))).allowed).toBe(true);
    await rl.reset("k1");
    expect((await rl.hit("k1", rule, t0)).remaining).toBe(2);
  });

  it("purges expired windows", async () => {
    const rl = new DbRateLimiter(handle.db);
    await rl.hit("old", rule, new Date("2020-01-01T00:00:00Z"));
    expect(await rl.purgeExpired(new Date("2021-01-01T00:00:00Z"))).toBeGreaterThanOrEqual(1);
  });

  it("rejects invalid rules", async () => {
    await expect(new DbRateLimiter(handle.db).hit("k", { limit: 0, windowSeconds: 1 })).rejects.toThrow(RangeError);
  });
});
