/**
 * The authorization guard. Every admin route handler and server action calls
 * `requireAdmin` (or `requireAdminToken`) first; there is no other way to obtain
 * an AdminPrincipal. Edge middleware may only check cookie presence (scrypt and
 * the DB are Node-only), so this is the real check.
 */
import type { AdminAction } from "./permissions";
import { can } from "./permissions";
import { readCookie } from "./cookie";
import { authenticateToken, type AdminPrincipal, type AuthDeps } from "./session";

export class AdminAuthError extends Error {
  readonly status: 401 | 403 | 404;
  readonly code: "admin_disabled" | "unauthenticated" | "forbidden" | "bad_origin";
  constructor(status: 401 | 403 | 404, code: AdminAuthError["code"], message: string) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
    this.code = code;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type GuardConfig = {
  cookieName: string;
  /** Origin of SITE_URL, e.g. https://bookie.example. */
  siteOrigin: string;
};

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/** Mutating requests must carry an Origin that matches the site or the Host header. */
export function assertSameOrigin(request: Request, config: GuardConfig): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  if (origin === null) throw new AdminAuthError(403, "bad_origin", "Missing Origin header");
  const originHost = hostOf(origin);
  const host = request.headers.get("host");
  const matchesSite = origin === config.siteOrigin;
  const matchesHost = originHost !== null && host !== null && originHost === host;
  if (!matchesSite && !matchesHost) throw new AdminAuthError(403, "bad_origin", "Origin not allowed");
}

/** Token-based entry (server actions read the cookie via next/headers and pass the value). */
export async function requireAdminToken(deps: AuthDeps, token: string | null, action: AdminAction): Promise<AdminPrincipal> {
  if (deps.bootstrap === null) throw new AdminAuthError(404, "admin_disabled", "Not found");
  const principal = await authenticateToken(deps, token);
  if (principal === null) throw new AdminAuthError(401, "unauthenticated", "Sign in required");
  if (!can(principal.role, action)) throw new AdminAuthError(403, "forbidden", "Not permitted");
  return principal;
}

/** Request-based entry for route handlers: origin check, session check, role check. */
export async function requireAdmin(
  deps: AuthDeps,
  config: GuardConfig,
  request: Request,
  action: AdminAction,
): Promise<AdminPrincipal> {
  if (deps.bootstrap === null) throw new AdminAuthError(404, "admin_disabled", "Not found");
  assertSameOrigin(request, config);
  const token = readCookie(request.headers.get("cookie"), config.cookieName);
  return requireAdminToken(deps, token, action);
}

/** Any signed-in admin, whatever the role (e.g. "who am I"). Same origin and session checks. */
export async function requireAdminSession(deps: AuthDeps, config: GuardConfig, request: Request): Promise<AdminPrincipal> {
  if (deps.bootstrap === null) throw new AdminAuthError(404, "admin_disabled", "Not found");
  assertSameOrigin(request, config);
  const principal = await authenticateToken(deps, readCookie(request.headers.get("cookie"), config.cookieName));
  if (principal === null) throw new AdminAuthError(401, "unauthenticated", "Sign in required");
  return principal;
}
