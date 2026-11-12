import { describe, expect, it } from "vitest";
import { classifyIp, isSafeExternalUrl, validateExternalUrl } from "@/lib/validation/external-url";

const reason = (u: string): string | null => {
  const r = validateExternalUrl(u);
  return r.ok ? null : r.reason;
};

describe("validateExternalUrl accepts", () => {
  it.each([
    "https://example.com",
    "https://example.com/path?q=1#frag",
    "https://sub.domain.example.co.uk/a/b",
    "https://EXAMPLE.com:443/x",
    "https://xn--bcher-kva.example/",
    "https://8.8.8.8/",
    "https://[2606:4700:4700::1111]/",
  ])("%s", (u) => {
    expect(validateExternalUrl(u).ok).toBe(true);
  });

  it("returns the normalised URL", () => {
    const r = validateExternalUrl("  https://EXAMPLE.com:443/A  ");
    expect(r.ok && r.url.toString()).toBe("https://example.com/A");
  });
});

describe("validateExternalUrl rejects", () => {
  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["x".repeat(2100), "too_long"],
    ["not a url", "invalid_url"],
    ["https://", "invalid_url"],
    ["https://exa\u0000mple.com", "invalid_url"],
    ["https://example.com\\@evil.com", "invalid_url"],
    ["http://example.com", "not_https"],
    ["ftp://example.com", "not_https"],
    ["file:///etc/passwd", "not_https"],
    ["javascript:alert(1)", "not_https"],
    ["data:text/html,hi", "not_https"],
    ["https://user@example.com", "credentials_not_allowed"],
    ["https://user:pass@example.com", "credentials_not_allowed"],
    ["https://:pass@example.com", "credentials_not_allowed"],
    ["https://example.com:8443", "port_not_allowed"],
    ["https://example.com:22", "port_not_allowed"],
    ["https://localhost", "host_not_allowed"],
    ["https://localhost.", "host_not_allowed"],
    ["https://foo.localhost", "host_not_allowed"],
    ["https://printer.local", "host_not_allowed"],
    ["https://db.internal", "host_not_allowed"],
    ["https://intranet", "host_not_allowed"],
    ["https://metadata.google.internal", "host_not_allowed"],
    ["https://127.0.0.1", "private_address"],
    ["https://127.1", "private_address"],
    ["https://2130706433", "private_address"],
    ["https://0x7f000001", "private_address"],
    ["https://0177.0.0.1", "private_address"],
    ["https://0.0.0.0", "private_address"],
    ["https://10.0.0.5", "private_address"],
    ["https://172.16.0.1", "private_address"],
    ["https://172.31.255.255", "private_address"],
    ["https://192.168.1.1", "private_address"],
    ["https://169.254.169.254", "private_address"],
    ["https://100.64.0.1", "private_address"],
    ["https://224.0.0.1", "private_address"],
    ["https://255.255.255.255", "private_address"],
    ["https://198.18.0.1", "private_address"],
    ["https://[::1]", "private_address"],
    ["https://[::]", "private_address"],
    ["https://[fe80::1]", "private_address"],
    ["https://[fc00::1]", "private_address"],
    ["https://[fd12:3456::1]", "private_address"],
    ["https://[::ffff:127.0.0.1]", "private_address"],
    ["https://[::ffff:a9fe:a9fe]", "private_address"],
    ["https://[64:ff9b::7f00:1]", "private_address"],
    ["https://[2002:7f00:1::1]", "private_address"],
    ["https://[ff02::1]", "private_address"],
    ["https://[2001:db8::1]", "private_address"],
    ["https://[fd00:ec2::254]", "private_address"],
  ])("%s -> %s", (u, expected) => {
    expect(reason(u)).toBe(expected);
  });

  it("isSafeExternalUrl mirrors validateExternalUrl", () => {
    expect(isSafeExternalUrl("https://example.com")).toBe(true);
    expect(isSafeExternalUrl("http://example.com")).toBe(false);
  });
});

describe("classifyIp", () => {
  it.each([
    ["8.8.8.8", "public"],
    ["1.1.1.1", "public"],
    ["172.15.0.1", "public"],
    ["172.32.0.1", "public"],
    ["100.63.255.255", "public"],
    ["100.128.0.1", "public"],
    ["192.0.2.1", "private"],
    ["198.51.100.7", "private"],
    ["203.0.113.9", "private"],
    ["192.0.0.9", "private"],
    ["2606:4700:4700::1111", "public"],
    ["::1", "private"],
    ["::2", "private"],
    ["::ffff:8.8.8.8", "private"],
    ["fec0::1", "private"],
    ["2001::1", "private"],
    ["2001:db8::1", "private"],
    ["fe80::1", "private"],
    ["256.1.1.1", "invalid"],
    ["1.2.3", "invalid"],
    ["example.com", "invalid"],
    ["1::2::3", "invalid"],
    ["1:2:3:4:5:6:7:8:9", "invalid"],
    ["1:2:3:4:5:6:7", "invalid"],
    ["::g", "invalid"],
    ["12345::1", "invalid"],
    ["::1.2.3.999", "invalid"],
    ["2606:4700:4700:0:0:0:0:1111", "public"],
    ["2606:4700:4700::1.2.3.4", "public"],
  ])("%s -> %s", (ip, expected) => {
    expect(classifyIp(ip)).toBe(expected);
  });
});
