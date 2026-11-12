/**
 * SSRF-safe validation of operator-supplied external URLs (source URL, licence
 * URL, ...). This NEVER fetches and never resolves DNS. It only decides whether
 * a URL is acceptable to store. Any code that later fetches such a URL must
 * (a) re-validate, (b) resolve the host itself and re-check every resolved
 * address with `classifyIp`, and (c) connect to that address (DNS rebinding).
 *
 * Accepted: https only, default port only, no credentials, public host name or
 * public IP literal. Rejected: everything else, including loopback, private,
 * link-local, CGNAT, multicast, reserved ranges, cloud metadata addresses and
 * IPv6 forms that embed an IPv4 address.
 */

export type UrlRejection =
  | "empty"
  | "too_long"
  | "invalid_url"
  | "not_https"
  | "credentials_not_allowed"
  | "port_not_allowed"
  | "host_not_allowed"
  | "private_address";

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: UrlRejection };

const MAX_URL_LENGTH = 2048;
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".localdomain", ".home.arpa", ".lan", ".intranet", ".corp"];

export type IpClassification = "public" | "private" | "invalid";

function parseIPv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m === null) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

function ipv4Blocked(p: number[]): boolean {
  const [a = 0, b = 0, c = 0] = p;
  return (
    a === 0 || // "this" network
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    a === 127 ||
    (a === 169 && b === 254) || // link-local incl. 169.254.169.254 metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 0 && c === 2) || // TEST-NET-1
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Expands an IPv6 literal (no brackets, no zone) to eight 16-bit groups, or null. */
function parseIPv6(host: string): number[] | null {
  if (!/^[0-9a-f:.]+$/i.test(host) || !host.includes(":")) return null;
  let h = host.toLowerCase();
  // Trailing dotted IPv4 (::ffff:1.2.3.4) -> two hex groups.
  const dotted = /^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
  if (dotted !== null) {
    const v4 = parseIPv4(dotted[2] ?? "");
    if (v4 === null) return null;
    const [a = 0, b = 0, c = 0, d = 0] = v4;
    h = `${dotted[1] ?? ""}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const toGroups = (s: string): string[] => (s === "" ? [] : s.split(":"));
  const head = toGroups(halves[0] ?? "");
  const tail = halves.length === 2 ? toGroups(halves[1] ?? "") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

function ipv6Blocked(g: number[]): boolean {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0] = g;
  const firstSixZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0;
  if (firstSixZero) return true; // ::, ::1, IPv4-compatible ::a.b.c.d
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) return true; // IPv4-mapped
  return (
    (g0 & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (g0 & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (g0 & 0xffc0) === 0xfec0 || // fec0::/10 deprecated site-local
    (g0 & 0xff00) === 0xff00 || // multicast
    (g0 === 0x0064 && g1 === 0xff9b) || // 64:ff9b::/96 NAT64 (embeds IPv4)
    g0 === 0x2002 || // 6to4 (embeds IPv4)
    (g0 === 0x2001 && g1 === 0) || // Teredo
    (g0 === 0x2001 && g1 === 0x0db8) || // documentation
    (g0 & 0xe000) !== 0x2000 // only global unicast 2000::/3 is acceptable
  );
}

/** Classifies an IP literal (IPv4 dotted or IPv6 without brackets). Exposed for fetchers that resolve DNS. */
export function classifyIp(ip: string): IpClassification {
  const v4 = parseIPv4(ip);
  if (v4 !== null) return ipv4Blocked(v4) ? "private" : "public";
  const v6 = parseIPv6(ip);
  if (v6 !== null) return ipv6Blocked(v6) ? "private" : "public";
  return "invalid";
}

export function validateExternalUrl(input: string): UrlCheck {
  const raw = input.trim();
  if (raw.length === 0) return { ok: false, reason: "empty" };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: "too_long" };
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return { ok: false, reason: "invalid_url" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.protocol !== "https:") return { ok: false, reason: "not_https" };
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "credentials_not_allowed" };
  if (url.port !== "") return { ok: false, reason: "port_not_allowed" }; // WHATWG drops :443 for https
  if (url.hostname === "") return { ok: false, reason: "invalid_url" };

  // WHATWG URL already canonicalised decimal/hex/octal IPv4 to dotted form.
  let host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
    return classifyIp(host) === "public" ? { ok: true, url } : { ok: false, reason: "private_address" };
  }
  const ipClass = classifyIp(host);
  if (ipClass === "private") return { ok: false, reason: "private_address" };
  if (ipClass === "public") return { ok: true, url };

  if (!host.includes(".")) return { ok: false, reason: "host_not_allowed" }; // single label, e.g. "intranet"
  if (host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "host_not_allowed" };
  }
  // A numeric-looking final label that survived URL parsing is not a real TLD.
  if (/^\d+$/.test(host.slice(host.lastIndexOf(".") + 1))) return { ok: false, reason: "host_not_allowed" };
  return { ok: true, url };
}

export function isSafeExternalUrl(input: string): boolean {
  return validateExternalUrl(input).ok;
}
