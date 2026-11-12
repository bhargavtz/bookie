import { describe, expect, it } from "vitest";
import { MemoryRateLimiter } from "@/server/auth/rate-limit";

const rule = { limit: 3, windowSeconds: 60 };
const t0 = new Date("2026-01-01T00:00:10Z");

describe("MemoryRateLimiter", () => {
  it("allows up to the limit then blocks with retry-after", async () => {
    const rl = new MemoryRateLimiter();
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await rl.hit("k", rule, t0));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0, 0]);
    expect(results[3]?.retryAfterSeconds).toBe(50);
    expect(results[3]?.resetAt.toISOString()).toBe("2026-01-01T00:01:00.000Z");
    expect(results[0]?.retryAfterSeconds).toBe(0);
  });

  it("starts a fresh window and isolates keys", async () => {
    const rl = new MemoryRateLimiter();
    for (let i = 0; i < 4; i++) await rl.hit("k", rule, t0);
    expect((await rl.hit("other", rule, t0)).allowed).toBe(true);
    expect((await rl.hit("k", rule, new Date("2026-01-01T00:01:00Z"))).allowed).toBe(true);
  });

  it("reset clears a key", async () => {
    const rl = new MemoryRateLimiter();
    for (let i = 0; i < 4; i++) await rl.hit("k", rule, t0);
    await rl.reset("k");
    expect((await rl.hit("k", rule, t0)).remaining).toBe(2);
  });

  it("rejects nonsensical rules", async () => {
    const rl = new MemoryRateLimiter();
    await expect(rl.hit("k", { limit: 0, windowSeconds: 60 })).rejects.toThrow(RangeError);
    await expect(rl.hit("k", { limit: 1, windowSeconds: 0 })).rejects.toThrow(RangeError);
    await expect(rl.hit("k", { limit: 1.5, windowSeconds: 1 })).rejects.toThrow(RangeError);
  });
});
