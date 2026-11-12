import type { NextConfig } from "next";

/**
 * Content-Security-Policy. Notes:
 * - `script-src 'unsafe-inline'`: the App Router streams inline bootstrap
 *   scripts; a nonce would force every page to render dynamically. Remote
 *   scripts are still blocked (`'self'` only), and there is no `eval` in production.
 * - `'wasm-unsafe-eval'`: pdf.js compiles its WebAssembly helpers (served from /pdfjs/).
 * - `worker-src 'self'`: the pdf.js worker is the same-origin file /pdfjs/<version>/pdf.worker.min.mjs.
 * - `style-src 'unsafe-inline'`: next/font and the reader inject style rules.
 * - Development adds `'unsafe-eval'` and websockets for React refresh and HMR.
 */
export function contentSecurityPolicy(development: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(development ? ["'unsafe-eval'"] : [])],
    "worker-src": ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(development ? ["ws:", "wss:"] : [])],
    "media-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function securityHeaders(development: boolean): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(development) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Legacy equivalent of frame-ancestors for browsers that ignore CSP.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  ];
}

/** Routes that must not appear in search results even if linked (robots.txt also disallows them). */
export const NOINDEX_SOURCES = ["/admin/:path*", "/api/:path*"] as const;

export async function headers() {
  return [
    { source: "/:path*", headers: securityHeaders(process.env.NODE_ENV !== "production") },
    ...NOINDEX_SOURCES.map((source) => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] })),
  ];
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // PGlite ships WASM assets that must be loaded from node_modules at runtime,
  // not bundled. `pg` is listed for explicitness.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Keep the committed SQL migrations available to a traced/standalone build.
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*"],
  },
  headers,
};

export default nextConfig;
