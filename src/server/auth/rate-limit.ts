/**
 * Rate limiting: one interface, a DB-backed implementation (works across
 * instances) and an in-memory fallback. Fixed windows. Callers pass an already
 * namespaced and hashed key (e.g. `login:ip:<salted hash>`); raw IPs/emails must
 * never be used as keys.
 */
import { eq, lt, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { rateLimits } from "@/server/db/schema";

export type RateLimitRule = { limit: number; windowSeconds: number };

export type RateLimitResult = {
  allowed: boolean;
  /** Hits left in the current window (0 when blocked). */
  remaining: number;
  /** When the current window ends. */
  resetAt: Date;
  /** Seconds a blocked caller should wait (for Retry-After); 0 when allowed. */
  retryAfterSeconds: number;
};

export interface RateLimiter {
  /** Records one hit and reports whether it is within the limit. */
  hit(key: string, rule: RateLimitRule, now?: Date): Promise<RateLimitResult>;
  /** Clears a key (e.g. after a successful login). */
  reset(key: string): Promise<void>;
}

function windowBounds(now: Date, windowSeconds: number): { start: Date; end: Date } {
  const ms = windowSeconds * 1000;
  const startMs = Math.floor(now.getTime() / ms) * ms;
  return { start: new Date(startMs), end: new Date(startMs + ms) };
}

function toResult(count: number, rule: RateLimitRule, end: Date, now: Date): RateLimitResult {
  const allowed = count <= rule.limit;
  return {
    allowed,
    remaining: Math.max(rule.limit - count, 0),
    resetAt: end,
    retryAfterSeconds: allowed ? 0 : Math.max(Math.ceil((end.getTime() - now.getTime()) / 1000), 1),
  };
}

function assertRule(rule: RateLimitRule): void {
  if (!Number.isInteger(rule.limit) || rule.limit < 1 || !Number.isInteger(rule.windowSeconds) || rule.windowSeconds < 1) {
    throw new RangeError("invalid rate limit rule");
  }
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly counters = new Map<string, { windowStart: number; count: number }>();

  async hit(key: string, rule: RateLimitRule, now: Date = new Date()): Promise<RateLimitResult> {
    assertRule(rule);
    const { start, end } = windowBounds(now, rule.windowSeconds);
    const current = this.counters.get(key);
    const count = current !== undefined && current.windowStart === start.getTime() ? current.count + 1 : 1;
    this.counters.set(key, { windowStart: start.getTime(), count });
    if (this.counters.size > 10_000) this.sweep(now.getTime());
    return toResult(count, rule, end, now);
  }

  reset(key: string): Promise<void> {
    this.counters.delete(key);
    return Promise.resolve();
  }

  private sweep(nowMs: number): void {
    for (const [key, value] of this.counters) {
      if (value.windowStart + 24 * 3600 * 1000 < nowMs) this.counters.delete(key);
    }
  }
}

export class DbRateLimiter implements RateLimiter {
  constructor(private readonly db: Db) {}

  async hit(key: string, rule: RateLimitRule, now: Date = new Date()): Promise<RateLimitResult> {
    assertRule(rule);
    const { start, end } = windowBounds(now, rule.windowSeconds);
    const rows = await this.db
      .insert(rateLimits)
      .values({ key, windowStart: start, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimits.key, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });
    const count = rows[0]?.count ?? 1;
    return toResult(count, rule, end, now);
  }

  async reset(key: string): Promise<void> {
    await this.db.delete(rateLimits).where(eq(rateLimits.key, key));
  }

  /** Housekeeping: drop windows that ended before `olderThan`. Returns rows removed. */
  async purgeExpired(olderThan: Date): Promise<number> {
    const removed = await this.db.delete(rateLimits).where(lt(rateLimits.windowStart, olderThan)).returning({ key: rateLimits.key });
    return removed.length;
  }
}
