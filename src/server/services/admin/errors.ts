import type { AdminAction } from "@/server/auth/permissions";
import { can } from "@/server/auth/permissions";
import type { AdminPrincipal } from "@/server/auth/session";

export type AdminErrorCode =
  | "validation_failed"
  | "not_found"
  | "forbidden"
  | "conflict"
  | "duplicate_isbn"
  | "duplicate_checksum"
  | "publish_blocked"
  | "rights_guard"
  | "invalid_state"
  | "upload_rejected"
  | "csv_invalid"
  | "in_use";

/** A failure the caller should see: status, a stable code, a safe message, optional structured details. Never carries secrets or raw driver text. */
export class AdminError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 413 | 415 | 422;
  readonly code: AdminErrorCode;
  readonly details: unknown;
  constructor(status: AdminError["status"], code: AdminErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AdminError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what: string): AdminError => new AdminError(404, "not_found", `${what} not found`);

export function requirePermission(principal: AdminPrincipal, action: AdminAction): void {
  if (!can(principal.role, action)) throw new AdminError(403, "forbidden", "Your role is not permitted to do this");
}

type PgErrorInfo = { code?: string; constraint?: string; message: string };

function pgErrorInfo(error: unknown): PgErrorInfo | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
      const constraint = (current as { constraint?: unknown }).constraint;
      return { code, ...(typeof constraint === "string" ? { constraint } : {}), message: current.message };
    }
    current = current.cause;
  }
  return null;
}

/**
 * Turns database guard failures into clean AdminErrors; unknown errors pass
 * through untouched (and are reported as 500 by the route wrapper without text).
 */
export function mapDbError(error: unknown): unknown {
  if (error instanceof AdminError) return error;
  const info = pgErrorInfo(error);
  if (info === null) return error;
  if (info.code === "23514") {
    if (info.constraint === "books_publish_requires_license" || /cannot be published/.test(info.message)) {
      return new AdminError(409, "publish_blocked", "A book cannot be published without an approved or restricted licence");
    }
    if (info.constraint === "licenses_published_requires_rights" || /must stay approved or restricted/.test(info.message)) {
      return new AdminError(409, "rights_guard", "Unpublish the book before downgrading or removing its licence");
    }
    return new AdminError(422, "validation_failed", "The change violates a data rule", { constraint: info.constraint ?? null });
  }
  if (info.code === "23505") {
    const duplicateIsbn = info.constraint === "books_isbn13_uq";
    const duplicateChecksum = info.constraint === "assets_pdf_sha256_uq";
    if (duplicateIsbn) return new AdminError(409, "duplicate_isbn", "Another book already has this ISBN-13");
    if (duplicateChecksum) return new AdminError(409, "duplicate_checksum", "This exact PDF is already in the library");
    return new AdminError(409, "conflict", "A record with the same unique value already exists", { constraint: info.constraint ?? null });
  }
  if (info.code === "23503" || info.code === "23001") return new AdminError(409, "in_use", "The record is still referenced by other records");
  return error;
}

/** Runs `fn`, mapping database guard errors. */
export async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw mapDbError(error);
  }
}
