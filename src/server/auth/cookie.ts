/** Admin session cookie helpers (pure). HttpOnly + Secure + SameSite=Strict, Path=/. */

export const ADMIN_COOKIE_BASE = "bookie_admin";

/** `__Host-` is only usable over https, so it is applied in production only. */
export function adminCookieName(production: boolean): string {
  return production ? `__Host-${ADMIN_COOKIE_BASE}` : ADMIN_COOKIE_BASE;
}

export function serializeSessionCookie(name: string, token: string, maxAgeSeconds: number): string {
  return `${name}=${token}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; HttpOnly; Secure; SameSite=Strict`;
}

export function serializeClearedCookie(name: string): string {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

/** Reads one cookie value out of a `Cookie` request header. */
export function readCookie(header: string | null, name: string): string | null {
  if (header === null) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      return value === "" ? null : value;
    }
  }
  return null;
}
