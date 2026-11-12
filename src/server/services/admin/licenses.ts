import { licenseInputSchema } from "@/contracts/license";
import type { AdminPrincipal } from "@/server/auth/session";
import { writeAudit } from "@/server/repositories/admin/audit";
import { getBook, setBookStatus } from "@/server/repositories/admin/books";
import { getLicense, upsertLicense, type LicenseRecord, type LicenseValues } from "@/server/repositories/admin/licenses";
import { type AdminContext, inTransaction } from "./context";
import { notFound, requirePermission } from "./errors";
import { parseOrThrow } from "./books";

/**
 * Create or update the one rights record of a book.
 *  - Staying `pending` (draft evidence) needs `license.edit` (editor, reviewer, owner).
 *  - Entering or leaving approved / restricted / removed needs `license.review` (reviewer, owner).
 *  - Approving or restricting stamps the acting admin and time as approver.
 *  - Anything that stops a published book qualifying (pending, removed) unpublishes it
 *    in the same transaction; the deferred database trigger would otherwise abort the commit.
 * URLs are validated (https, no private hosts) and are never fetched.
 */
export async function setLicense(ctx: AdminContext, principal: AdminPrincipal, bookId: string, input: unknown): Promise<LicenseRecord> {
  const data = parseOrThrow(licenseInputSchema, input);
  const book = await getBook(ctx.db, bookId);
  if (book === null || book.deletedAt !== null) throw notFound("Book");
  const existing = await getLicense(ctx.db, bookId);

  const staysPending = data.rightsStatus === "pending" && (existing === null || existing.rightsStatus === "pending");
  requirePermission(principal, staysPending ? "license.edit" : "license.review");

  const now = ctx.now();
  const grants = data.rightsStatus === "approved" || data.rightsStatus === "restricted";
  const values: LicenseValues = {
    rightsStatus: data.rightsStatus,
    licenseType: data.licenseType ?? null,
    licenseUrl: data.licenseUrl ?? null,
    rightsHolder: data.rightsHolder ?? null,
    attributionText: data.attributionText ?? null,
    sourceUrl: data.sourceUrl ?? null,
    evidenceNote: data.evidenceNote ?? null,
    allowRead: data.allowRead,
    allowDownload: data.allowDownload,
    approvedBy: grants ? principal.userId : null,
    approvedAt: grants ? now : null,
    expiresAt: data.expiresAt ?? null,
    restrictedReason: data.restrictedReason ?? null,
    removedAt: data.rightsStatus === "removed" ? now : null,
    removedReason: data.rightsStatus === "removed" ? (data.removedReason ?? null) : null,
  };

  return inTransaction(ctx, async (tx) => {
    const saved = await upsertLicense(tx, bookId, values);
    const unpublish = book.status === "published" && !grants;
    if (unpublish) await setBookStatus(tx, bookId, "unpublished");
    await writeAudit(tx, {
      adminUserId: principal.userId,
      action: "license.update",
      entityType: "book",
      entityId: bookId,
      diff: {
        from: existing?.rightsStatus ?? null,
        to: data.rightsStatus,
        allowRead: data.allowRead,
        allowDownload: data.allowDownload,
        unpublished: unpublish,
      },
    });
    return saved;
  });
}
