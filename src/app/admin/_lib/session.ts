import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AdminAuthError, requireAdminToken } from "@/server/auth/guard";
import type { AdminAction } from "@/server/auth/permissions";
import type { AdminPrincipal } from "@/server/auth/session";
import { AdminError, getAdminRuntime, mapDbError, type AdminContext, type AdminRuntime } from "@/server/services/admin";

export type AdminPage = { principal: AdminPrincipal; ctx: AdminContext; runtime: AdminRuntime };

/**
 * Server-side session check for pages and layouts. The real authorisation lives
 * here and in the services (role checks); the layout alone is not enough because
 * pages can be rendered without re-running their layout.
 *   no session      -> /admin/login
 *   admin disabled  -> 404 (same as the API)
 *   role not allowed -> /admin?denied=1
 */
export async function requireAdminPage(action: AdminAction): Promise<AdminPage> {
  const runtime = await getAdminRuntime();
  const token = (await cookies()).get(runtime.guard.cookieName)?.value ?? null;
  try {
    const principal = await requireAdminToken(runtime.auth, token, action);
    return { principal, ctx: runtime.ctx, runtime };
  } catch (error) {
    if (error instanceof AdminAuthError) {
      if (error.status === 404) notFound();
      if (error.status === 403) redirect("/admin?denied=1");
      redirect("/admin/login");
    }
    throw error;
  }
}

/** Runs a service read; a missing record becomes a 404 page and a refused role a redirect, anything else bubbles to the error boundary. */
export async function loadOrRedirect<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const mapped = mapDbError(error);
    if (mapped instanceof AdminError) {
      if (mapped.status === 404) notFound();
      if (mapped.status === 403) redirect("/admin?denied=1");
    }
    throw mapped;
  }
}

/** For the login page: is there already a valid session? Never throws for "not signed in". */
export async function hasAdminSession(): Promise<"signed_in" | "signed_out" | "disabled"> {
  const runtime = await getAdminRuntime();
  if (runtime.auth.bootstrap === null) return "disabled";
  const token = (await cookies()).get(runtime.guard.cookieName)?.value ?? null;
  try {
    await requireAdminToken(runtime.auth, token, "stats.view");
    return "signed_in";
  } catch (error) {
    if (error instanceof AdminAuthError) return "signed_out";
    throw error;
  }
}
