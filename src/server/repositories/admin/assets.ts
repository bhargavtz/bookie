import { and, eq, ne } from "drizzle-orm";
import type { AssetKind, AssetStatus, StorageDriverName } from "@/contracts/enums";
import type { Db } from "@/server/db/client";
import { assets, books } from "@/server/db/schema";

export type AssetRecord = {
  id: string;
  bookId: string;
  kind: AssetKind;
  storageDriver: StorageDriverName;
  storageKey: string;
  originalFilename: string | null;
  mimeType: string;
  byteSize: number;
  sha256: string | null;
  status: AssetStatus;
};

const columns = {
  id: assets.id,
  bookId: assets.bookId,
  kind: assets.kind,
  storageDriver: assets.storageDriver,
  storageKey: assets.storageKey,
  originalFilename: assets.originalFilename,
  mimeType: assets.mimeType,
  byteSize: assets.byteSize,
  sha256: assets.sha256,
  status: assets.status,
};

export async function insertAsset(db: Db, values: AssetRecord): Promise<AssetRecord> {
  const rows = await db.insert(assets).values(values).returning(columns);
  const row = rows[0];
  if (row === undefined) throw new Error("asset insert returned no row");
  return row;
}

export async function getAsset(db: Db, assetId: string): Promise<AssetRecord | null> {
  const rows = await db.select(columns).from(assets).where(eq(assets.id, assetId)).limit(1);
  return rows[0] ?? null;
}

/** The live (not deleted) PDF with this checksum, with the title of the book that owns it. */
export async function findLivePdfBySha256(
  db: Db,
  sha256: string,
): Promise<{ assetId: string; bookId: string; title: string } | null> {
  const rows = await db
    .select({ assetId: assets.id, bookId: assets.bookId, title: books.title })
    .from(assets)
    .innerJoin(books, eq(books.id, assets.bookId))
    .where(and(eq(assets.sha256, sha256), eq(assets.kind, "pdf"), ne(assets.status, "deleted")))
    .limit(1);
  return rows[0] ?? null;
}

export async function setAssetStatus(db: Db, assetId: string, status: AssetStatus): Promise<void> {
  await db.update(assets).set({ status }).where(eq(assets.id, assetId));
}

export async function setBookPrimaryAsset(db: Db, bookId: string, assetId: string | null): Promise<void> {
  await db.update(books).set({ primaryAssetId: assetId }).where(eq(books.id, bookId));
}

export async function setBookCoverAsset(db: Db, bookId: string, assetId: string | null): Promise<void> {
  await db.update(books).set({ coverAssetId: assetId }).where(eq(books.id, bookId));
}
