import { getEnv } from "@/lib/env";
import { AdminAuthError, assertSameOrigin } from "@/server/auth/guard";
import { submitPublicTakedown } from "@/server/services/takedown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  Response.json(body, { status, headers: { ...NO_STORE, ...headers } });

/** Fixed acknowledgement: identical whether or not the named book exists. */
const ACKNOWLEDGEMENT = "Your request has been received and will be reviewed. No decision is implied by this message.";

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  // Without a configured contact address the page tells people so and the form is disabled; refuse here too.
  if (env.CONTACT_EMAIL === undefined) return json(503, { error: { code: "not_configured", message: "Takedown requests are not available on this site yet." } });

  try {
    assertSameOrigin(request, { cookieName: "", siteOrigin: new URL(env.SITE_URL).origin });
  } catch (error) {
    if (error instanceof AdminAuthError) return json(403, { error: { code: "bad_origin", message: "Request not allowed." } });
    throw error;
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return json(415, { error: { code: "unsupported_media_type", message: "Send JSON." } });
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json(413, { error: { code: "too_large", message: "Request is too large." } });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: { code: "too_large", message: "Request is too large." } });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: { code: "invalid_json", message: "The request body is not valid JSON." } });
  }

  try {
    const outcome = await submitPublicTakedown(request.headers, body);
    if (outcome.status === "rate_limited") {
      return json(429, { error: { code: "rate_limited", message: "Too many requests. Please try again later." } }, { "Retry-After": String(outcome.retryAfterSeconds) });
    }
    if (outcome.status === "invalid") {
      return json(400, { error: { code: "validation_failed", message: "Please check the form and try again.", issues: outcome.issues } });
    }
    return json(202, { ok: true, message: ACKNOWLEDGEMENT });
  } catch (error) {
    // Name only: database errors can carry connection details.
    console.error("takedown submission failed", error instanceof Error ? error.name : "unknown");
    return json(500, { error: { code: "server_error", message: "The request could not be saved. Please try again later." } });
  }
}
