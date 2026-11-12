import { getClientIp } from "@/server/auth/client-ip";
import { serializeSessionCookie } from "@/server/auth/cookie";
import { AdminAuthError, assertSameOrigin } from "@/server/auth/guard";
import { login, SESSION_ABSOLUTE_MS } from "@/server/auth/session";
import { getAdminRuntime } from "@/server/services/admin";
import { errorResponse, json, readJson } from "../_lib/handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Identical message for unknown account, wrong password and inactive account. */
const INVALID = { error: { code: "invalid_credentials", message: "Invalid email or password" } };

export async function POST(request: Request): Promise<Response> {
  try {
    const runtime = await getAdminRuntime();
    if (runtime.auth.bootstrap === null) throw new AdminAuthError(404, "admin_disabled", "Not found");
    assertSameOrigin(request, runtime.guard);
    const body = await readJson(request);
    const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const result = await login(runtime.auth, {
      email: typeof fields["email"] === "string" ? fields["email"] : "",
      password: typeof fields["password"] === "string" ? fields["password"] : "",
      ip: getClientIp(request.headers, runtime.trustProxy),
      userAgent: request.headers.get("user-agent"),
    });
    if (result.ok) {
      const response = json({ user: { email: result.principal.email, role: result.principal.role } });
      response.headers.append("Set-Cookie", serializeSessionCookie(runtime.guard.cookieName, result.token, SESSION_ABSOLUTE_MS / 1000));
      return response;
    }
    if (result.reason === "rate_limited") {
      return json(
        { error: { code: "rate_limited", message: "Too many attempts. Try again later." } },
        429,
        { "Retry-After": String(result.retryAfterSeconds) },
      );
    }
    if (result.reason === "disabled") throw new AdminAuthError(404, "admin_disabled", "Not found");
    return json(INVALID, 401);
  } catch (error) {
    return errorResponse(error);
  }
}
