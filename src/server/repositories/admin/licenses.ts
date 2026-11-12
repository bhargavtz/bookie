import { eq } from "drizzle-orm";
import type { RightsStatus, LicenseType } from "@/contracts/enums";
import type { Db } from "@/server/db/client";
import { licenses } from "@/server/db/schema";

export type LicenseRecord = {
  id: string;
  bookId: string;
  rightsStatus: RightsStatus;
  licenseType: LicenseType | null;
  licenseUrl: string | null;
  rightsHolder: string | null;
  attributionText: string | null;
  sourceUrl: string | null;
  evidenceNote: string | null;
  allowRead: boolean;
  allowDownload: boolean;
  approvedBy: string | null;
  approvedAt: Date | null;
  expiresAt: Date | null;
  restrictedReason: string | null;
  removedAt: Date | null;
  removedReason: string | null;
};

export async function getLicense(db: Db, bookId: string): Promise<LicenseRecord | null> {
  const rows = await db.select().from(licenses).where(eq(licenses.bookId, bookId)).limit(1);
  return rows[0] ?? null;
}

export type LicenseValues = Omit<LicenseRecord, "id" | "bookId">;

export async function upsertLicense(db: Db, bookId: string, values: LicenseValues): Promise<LicenseRecord> {
  const rows = await db
    .insert(licenses)
    .values({ bookId, ...values })
    .onConflictDoUpdate({ target: licenses.bookId, set: values })
    .returning();
  const row = rows[0];
  if (row === undefined) throw new Error("licence upsert returned no row");
  return row;
}
