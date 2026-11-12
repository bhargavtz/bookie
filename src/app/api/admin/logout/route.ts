import { readCookie, serializeClearedCookie } from "@/server/auth/cookie";
import { AdminAuthError, assertSameOrigin } from "@/server/auth/guard";
import { logout } from "@/server/auth/session";
import { getAdminRuntime } from "@/server/services/admin";
import { errorResponse, json } from "../_lib/handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-side revocation: the session row is marked revoked, so a copied cookie stops working too. */
export async function POST(request: Request): Promise<Response> {
  try {
    const runtime = await getAdminRuntime();
    if (runtime.auth.bootstrap === null) throw new AdminAuthError(404, "admin_disabled", "Not found");
    assertSameOrigin(request, runtime.guard);
    await logout(runtime.auth, readCookie(request.headers.get("cookie"), runtime.guard.cookieName));
    const response = json({ ok: true });
    response.headers.append("Set-Cookie", serializeClearedCookie(runtime.guard.cookieName));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
