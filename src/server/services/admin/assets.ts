import { randomUUID } from "node:crypto";
import type { AdminPrincipal } from "@/server/auth/session";
import { writeAudit } from "@/server/repositories/admin/audit";
import { getBook, setBookStatus } from "@/server/repositories/admin/books";
import {
  findLivePdfBySha256,
  getAsset,
  insertAsset,
  setAssetStatus,
  setBookCoverAsset,
  setBookPrimaryAsset,
  type AssetRecord,
} from "@/server/repositories/admin/assets";
import { assetStorageKey } from "@/server/storage/keys";
import { type AdminContext, inTransaction } from "./context";
import { AdminError, notFound, requirePermission } from "./errors";
import {
  displayFilename,
  UPLOAD_MESSAGES,
  validateCoverUpload,
  validatePdfUpload,
  type UploadRejection,
} from "./upload-validation";

export type UploadInput = { bytes: Uint8Array; filename: string | null };

function rejection(reason: UploadRejection): AdminError {
  const status = reason === "too_large" ? 413 : reason === "unsupported_image" || reason === "not_a_pdf" ? 415 : 422;
  return new AdminError(status, "upload_rejected", UPLOAD_MESSAGES[reason], { reason });
}

async function bookForUpload(ctx: AdminContext, bookId: string) {
  const book = await getBook(ctx.db, bookId);
  if (book === null || book.deletedAt !== null) throw notFound("Book");
  return book;
}

/**
 * Stores a PDF and makes it the book's primary file.
 * Validated by magic bytes and size, checksummed (SHA-256) and refused if the same
 * bytes are already live in the library. The stored key is server-generated.
 * Replacing the file of a published book sends it back to review: new bytes are unreviewed.
 */
export async function uploadPdf(ctx: AdminContext, principal: AdminPrincipal, bookId: string, file: UploadInput): Promise<AssetRecord> {
  requirePermission(principal, "asset.upload");
  const book = await bookForUpload(ctx, bookId);
  const check = validatePdfUpload(file.bytes, ctx.maxUploadBytes);
  if (!check.ok) throw rejection(check.reason);

  const duplicate = await findLivePdfBySha256(ctx.db, check.sha256);
  if (duplicate !== null) {
    throw new AdminError(409, "duplicate_checksum", "This exact PDF is already in the library", duplicate);
  }

  const assetId = randomUUID();
  const storageKey = assetStorageKey(bookId, assetId, "pdf");
  await ctx.storage.put(storageKey, file.bytes, { contentType: "application/pdf", maxBytes: ctx.maxUploadBytes });
  const previousId = book.primaryAssetId;
  try {
    const asset = await inTransaction(ctx, async (tx) => {
      const created = await insertAsset(tx, {
        id: assetId,
        bookId,
        kind: "pdf",
        storageDriver: ctx.storage.name,
        storageKey,
        originalFilename: displayFilename(file.filename),
        mimeType: "application/pdf",
        byteSize: check.size,
        sha256: check.sha256,
        status: "ready",
      });
      if (previousId !== null) await setAssetStatus(tx, previousId, "deleted");
      await setBookPrimaryAsset(tx, bookId, assetId);
      const backToReview = book.status === "published";
      if (backToReview) await setBookStatus(tx, bookId, "in_review");
      await writeAudit(tx, {
        adminUserId: principal.userId,
        action: "asset.upload_pdf",
        entityType: "book",
        entityId: bookId,
        diff: { assetId, sha256: check.sha256, bytes: check.size, replaced: previousId, backToReview },
      });
      return created;
    });
    if (previousId !== null) await removeStoredObject(ctx, previousId);
    return asset;
  } catch (error) {
    await ctx.storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function uploadCover(ctx: AdminContext, principal: AdminPrincipal, bookId: string, file: UploadInput): Promise<AssetRecord> {
  requirePermission(principal, "asset.upload");
  const book = await bookForUpload(ctx, bookId);
  const check = validateCoverUpload(file.bytes);
  if (!check.ok) throw rejection(check.reason);

  const assetId = randomUUID();
  const storageKey = assetStorageKey(bookId, assetId, check.ext);
  await ctx.storage.put(storageKey, file.bytes, { contentType: check.mime });
  const previousId = book.coverAssetId;
  try {
    const asset = await inTransaction(ctx, async (tx) => {
      const created = await insertAsset(tx, {
        id: assetId,
        bookId,
        kind: "cover",
        storageDriver: ctx.storage.name,
        storageKey,
        originalFilename: displayFilename(file.filename),
        mimeType: check.mime,
        byteSize: check.size,
        sha256: check.sha256,
        status: "ready",
      });
      if (previousId !== null) await setAssetStatus(tx, previousId, "deleted");
      await setBookCoverAsset(tx, bookId, assetId);
      await writeAudit(tx, {
        adminUserId: principal.userId,
        action: "asset.upload_cover",
        entityType: "book",
        entityId: bookId,
        diff: { assetId, sha256: check.sha256, bytes: check.size, replaced: previousId },
      });
      return created;
    });
    if (previousId !== null) await removeStoredObject(ctx, previousId);
    return asset;
  } catch (error) {
    await ctx.storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

async function removeStoredObject(ctx: AdminContext, assetId: string): Promise<void> {
  const old = await getAsset(ctx.db, assetId);
  if (old !== null) await ctx.storage.delete(old.storageKey).catch(() => undefined);
}
