import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AdminRole } from "@/contracts/enums";
import { MemoryRateLimiter } from "@/server/auth/rate-limit";
import { hashPassword } from "@/server/auth/password";
import type { AdminPrincipal, AuthDeps } from "@/server/auth/session";
import type { Db } from "@/server/db/client";
import { categories, technologies } from "@/server/db/schema";
import type { AdminContext } from "@/server/services/admin/context";
import { LocalStorageDriver } from "@/server/storage/local";
import { insertAdmin } from "./factories";

/** Cheap scrypt parameters so tests stay fast; production uses the defaults. */
export const TEST_SCRYPT = { N: 1024, r: 8, p: 1 } as const;

export async function makeStorage(): Promise<{ storage: LocalStorageDriver; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), "bookie-admin-test-"));
  return { storage: new LocalStorageDriver(dir), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

export function makeContext(db: Db, storage: LocalStorageDriver, now: () => Date = () => new Date()): AdminContext {
  return { db, storage, now, maxUploadBytes: 1024 * 1024 };
}

export async function makeAuthDeps(
  db: Db,
  options: { email?: string; password?: string; now?: () => Date; limiter?: AuthDeps["limiter"] } = {},
): Promise<AuthDeps & { password: string; email: string }> {
  const email = options.email ?? "owner@example.test";
  const password = options.password ?? "correct horse battery staple";
  return {
    db,
    limiter: options.limiter ?? new MemoryRateLimiter(),
    now: options.now ?? (() => new Date()),
    bootstrap: { email, passwordHash: await hashPassword(password, TEST_SCRYPT) },
    salt: "test-salt-0123456789",
    password,
    email,
  };
}

/** A principal for a DB-backed admin of the given role (service calls take principals directly). */
export async function principalFor(db: Db, role: AdminRole): Promise<AdminPrincipal> {
  const admin = await insertAdmin(db, { role });
  return { userId: admin.id, email: admin.email, role, sessionId: "00000000-0000-4000-8000-000000000000" };
}

/** A tiny structurally plausible PDF; `seed` makes the bytes (and checksum) unique. Generated, never third-party content. */
export function tinyPdf(seed: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n% ${seed}\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`);
}

export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

export async function insertCategory(db: Db, slug: string, name: string): Promise<void> {
  await db.insert(categories).values({ slug, name });
}

export async function insertTechnology(db: Db, slug: string, name: string): Promise<void> {
  await db.insert(technologies).values({ slug, name });
}
