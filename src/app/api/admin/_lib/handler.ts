import "server-only";
import { AdminAuthError, requireAdmin } from "@/server/auth/guard";
import type { AdminAction } from "@/server/auth/permissions";
import type { AdminPrincipal } from "@/server/auth/session";
import { AdminError, getAdminRuntime, mapDbError, type AdminContext, type AdminRuntime } from "@/server/services/admin";

const MAX_JSON_BYTES = 1024 * 1024;
/** Multipart framing and text fields on top of the file itself. */
const MULTIPART_OVERHEAD = 64 * 1024;

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const response = Response.json(data, { status, ...(headers !== undefined ? { headers } : {}) });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function errorResponse(error: unknown): Response {
  const mapped = mapDbError(error);
  if (mapped instanceof AdminAuthError) {
    return json({ error: { code: mapped.code, message: mapped.message } }, mapped.status);
  }
  if (mapped instanceof AdminError) {
    return json({ error: { code: mapped.code, message: mapped.message, details: mapped.details ?? null } }, mapped.status);
  }
  // Only the error class is logged: messages from drivers can echo values.
  console.error("admin route failed", mapped instanceof Error ? mapped.name : "unknown");
  return json({ error: { code: "internal", message: "Something went wrong" } }, 500);
}

export type RouteContext<P> = { params: Promise<P> };

export type AdminHandlerArgs<P> = {
  request: Request;
  params: P;
  principal: AdminPrincipal;
  ctx: AdminContext;
  runtime: AdminRuntime;
};

/**
 * The only way admin route handlers are written: runtime -> origin check -> session
 * -> role check (`requireAdmin`) -> handler -> uniform error mapping. A handler body
 * is never reached without an AdminPrincipal that may perform `action`.
 */
export function adminRoute<P = Record<string, never>>(
  action: AdminAction,
  handler: (args: AdminHandlerArgs<P>) => Promise<Response>,
): (request: Request, context: RouteContext<P>) => Promise<Response> {
  return async (request, context) => {
    try {
      const runtime = await getAdminRuntime();
      const principal = await requireAdmin(runtime.auth, runtime.guard, request, action);
      return await handler({ request, params: await context.params, principal, ctx: runtime.ctx, runtime });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new AdminError(415, "validation_failed", "Content-Type must be application/json");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_JSON_BYTES) throw new AdminError(413, "upload_rejected", "Request body is too large");
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw new AdminError(413, "upload_rejected", "Request body is too large");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AdminError(400, "validation_failed", "Body is not valid JSON");
  }
}

/** Query string values as an object of strings/numbers/booleans for the services' zod schemas. */
export function readQuery(request: Request): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (value === "true" || value === "false") out[key] = value === "true";
    else out[key] = /^\d+$/.test(value) ? Number(value) : value;
  }
  return out;
}

/** One file from multipart form data. The declared size is checked before anything is buffered. */
export async function readUpload(request: Request, maxBytes: number): Promise<{ bytes: Uint8Array; filename: string | null }> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) {
    throw new AdminError(415, "upload_rejected", "Content-Type must be multipart/form-data");
  }
  const declared = Number(request.headers.get("content-length") ?? "NaN");
  if (!Number.isFinite(declared)) throw new AdminError(413, "upload_rejected", "Content-Length is required for uploads");
  if (declared > maxBytes + MULTIPART_OVERHEAD) throw new AdminError(413, "upload_rejected", "The file is larger than the allowed size");
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AdminError(422, "upload_rejected", "Missing file field");
  return { bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name };
}

/** Path ids must be UUIDs; anything else is a 404 rather than a database error. */
export function idParam(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new AdminError(404, "not_found", "Not found");
  return value.toLowerCase();
}
