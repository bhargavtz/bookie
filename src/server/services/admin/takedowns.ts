import { z } from "zod";
import { emailSchema, optionalText, text, uuidSchema } from "@/contracts/primitives";
import { TAKEDOWN_STATUSES } from "@/contracts/enums";
import type { AdminPrincipal } from "@/server/auth/session";
import { writeAudit } from "@/server/repositories/admin/audit";
import { getBook, setBookStatus } from "@/server/repositories/admin/books";
import { getLicense, upsertLicense } from "@/server/repositories/admin/licenses";
import { getTakedown, insertAdminTakedown, listTakedowns, resolveTakedown, type TakedownRecord } from "@/server/repositories/admin/takedowns";
import { type AdminContext, inTransaction } from "./context";
import { AdminError, notFound, requirePermission } from "./errors";
import { parseOrThrow } from "./books";

const removeSchema = z.object({
  reason: text(1000, 3),
  /** Resolve an existing request from the public form... */
  takedownRequestId: uuidSchema.optional(),
  /** ...or record one received through another channel. */
  claimant: z
    .object({ name: text(200), email: emailSchema, relationship: text(200), description: text(5000, 10), organisation: optionalText(200) })
    .optional(),
});

/**
 * Takedown / removal: ONE transaction that sets the licence to `removed` (no read,
 * no download), unpublishes the book, records the takedown request as upheld and
 * writes the audit row. Public file responses are `private, max-age=0`, so access
 * ends immediately. Storage objects are kept (evidence); purging is a separate decision.
 */
export async function removeBookForTakedown(ctx: AdminContext, principal: AdminPrincipal, bookId: string, input: unknown): Promise<{ takedownRequestId: string }> {
  requirePermission(principal, "takedown.manage");
  const data = parseOrThrow(removeSchema, input);
  const book = await getBook(ctx.db, bookId);
  if (book === null) throw notFound("Book");
  if (data.takedownRequestId === undefined && data.claimant === undefined) {
    throw new AdminError(422, "validation_failed", "Provide takedownRequestId or claimant details", [{ field: "takedownRequestId", message: "required unless claimant is given" }]);
  }
  if (data.takedownRequestId !== undefined) {
    const request = await getTakedown(ctx.db, data.takedownRequestId);
    if (request === null) throw notFound("Takedown request");
    if (request.bookId !== null && request.bookId !== bookId) {
      throw new AdminError(422, "validation_failed", "The takedown request refers to a different book");
    }
  }
  const license = await getLicense(ctx.db, bookId);
  const now = ctx.now();

  return inTransaction(ctx, async (tx) => {
    await upsertLicense(tx, bookId, {
      rightsStatus: "removed",
      licenseType: license?.licenseType ?? null,
      licenseUrl: license?.licenseUrl ?? null,
      rightsHolder: license?.rightsHolder ?? null,
      attributionText: license?.attributionText ?? null,
      sourceUrl: license?.sourceUrl ?? null,
      evidenceNote: license?.evidenceNote ?? null,
      allowRead: false,
      allowDownload: false,
      approvedBy: license?.approvedBy ?? null,
      approvedAt: license?.approvedAt ?? null,
      expiresAt: license?.expiresAt ?? null,
      restrictedReason: license?.restrictedReason ?? null,
      removedAt: now,
      removedReason: data.reason,
    });
    if (book.status === "published") await setBookStatus(tx, bookId, "unpublished");

    let takedownRequestId: string;
    if (data.takedownRequestId !== undefined) {
      takedownRequestId = data.takedownRequestId;
      await resolveTakedown(tx, takedownRequestId, { status: "upheld", resolutionNote: data.reason, resolvedBy: principal.userId, resolvedAt: now });
    } else {
      const claimant = data.claimant;
      if (claimant === undefined) throw new AdminError(422, "validation_failed", "Claimant details required");
      takedownRequestId = await insertAdminTakedown(tx, {
        bookId,
        claimantName: claimant.name,
        claimantEmail: claimant.email,
        relationship: claimant.relationship,
        description: claimant.description,
        signature: claimant.name,
        status: "upheld",
        resolutionNote: data.reason,
        resolvedBy: principal.userId,
        resolvedAt: now,
      });
    }
    await writeAudit(tx, {
      adminUserId: principal.userId,
      action: "book.takedown_remove",
      entityType: "book",
      entityId: bookId,
      diff: { takedownRequestId, reason: data.reason, wasPublished: book.status === "published" },
    });
    return { takedownRequestId };
  });
}

const resolveSchema = z.object({
  status: z.enum(TAKEDOWN_STATUSES).refine((s) => s !== "open", "cannot reopen from here"),
  note: text(2000, 3),
});

/** Triage without removing the book (e.g. rejected as unfounded, withdrawn, under review). Upholding goes through removeBookForTakedown. */
export async function updateTakedownStatus(ctx: AdminContext, principal: AdminPrincipal, id: string, input: unknown): Promise<void> {
  requirePermission(principal, "takedown.manage");
  const data = parseOrThrow(resolveSchema, input);
  if (data.status === "upheld") {
    throw new AdminError(422, "validation_failed", "Use the remove action to uphold a request", [{ field: "status", message: "upheld requires removal" }]);
  }
  const request = await getTakedown(ctx.db, id);
  if (request === null) throw notFound("Takedown request");
  await inTransaction(ctx, async (tx) => {
    await resolveTakedown(tx, id, {
      status: data.status,
      resolutionNote: data.note,
      resolvedBy: principal.userId,
      resolvedAt: ctx.now(),
    });
    await writeAudit(tx, { adminUserId: principal.userId, action: "takedown.update", entityType: "takedown", entityId: id, diff: { from: request.status, to: data.status } });
  });
}

const listSchema = z.object({
  status: z.enum(TAKEDOWN_STATUSES).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
});

export async function listTakedownRequests(ctx: AdminContext, principal: AdminPrincipal, query: unknown): Promise<TakedownRecord[]> {
  requirePermission(principal, "takedown.manage");
  const q = parseOrThrow(listSchema, query);
  return listTakedowns(ctx.db, q.status, q.limit, q.offset);
}
