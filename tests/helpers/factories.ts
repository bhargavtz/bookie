import { randomUUID } from "node:crypto";
import type { Db } from "@/server/db/client";
import { adminUsers, assets, books, licenses } from "@/server/db/schema";

/** Test-only row builders. These create fixture rows in throwaway databases; nothing here is app seed data. */

type BookRow = typeof books.$inferInsert;
type LicenseRow = typeof licenses.$inferInsert;
type AssetRow = typeof assets.$inferInsert;

let counter = 0;
const next = (): number => ++counter;

export async function insertAdmin(db: Db, overrides: Partial<typeof adminUsers.$inferInsert> = {}) {
  const n = next();
  const [row] = await db
    .insert(adminUsers)
    .values({ email: `admin${n}@example.test`, passwordHash: "scrypt$1$1$1$c2FsdA$aGFzaA", role: "owner", ...overrides })
    .returning();
  if (!row) throw new Error("insertAdmin failed");
  return row;
}

export async function insertBook(db: Db, overrides: Partial<BookRow> = {}) {
  const n = next();
  const [row] = await db
    .insert(books)
    .values({ slug: `test-book-${n}`, title: `Test Book ${n}`, ...overrides })
    .returning();
  if (!row) throw new Error("insertBook failed");
  return row;
}

export async function insertLicense(db: Db, bookId: string, overrides: Partial<LicenseRow> = {}) {
  const [row] = await db
    .insert(licenses)
    .values({ bookId, ...overrides })
    .returning();
  if (!row) throw new Error("insertLicense failed");
  return row;
}

/** An approved licence satisfying the DB check (needs an admin row for approved_by). */
export async function insertApprovedLicense(db: Db, bookId: string, overrides: Partial<LicenseRow> = {}) {
  const admin = await insertAdmin(db);
  return insertLicense(db, bookId, {
    rightsStatus: "approved",
    licenseType: "project-original",
    rightsHolder: "Test project",
    approvedBy: admin.id,
    approvedAt: new Date(),
    allowRead: true,
    ...overrides,
  });
}

export async function insertAsset(db: Db, bookId: string, overrides: Partial<AssetRow> = {}) {
  const id = randomUUID();
  const [row] = await db
    .insert(assets)
    .values({
      id,
      bookId,
      kind: "pdf",
      storageDriver: "local",
      storageKey: `books/${bookId}/${id}.pdf`,
      mimeType: "application/pdf",
      byteSize: 1024,
      status: "ready",
      ...overrides,
    })
    .returning();
  if (!row) throw new Error("insertAsset failed");
  return row;
}

/** Error code (SQLSTATE) of a failed promise, looking through driver wrappers. */
export async function sqlState(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    let current: unknown = error;
    while (current instanceof Error) {
      const code = (current as { code?: unknown }).code;
      if (typeof code === "string") return code;
      current = current.cause;
    }
    return "unknown";
  }
  return undefined;
}
