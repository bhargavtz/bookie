import { describe, expect, it } from "vitest";
import { AdminError, mapDbError, requirePermission } from "@/server/services/admin/errors";

const pgError = (code: string, message: string, constraint?: string): Error =>
  Object.assign(new Error(message), { code, ...(constraint ? { constraint } : {}) });
const wrapped = (inner: Error): Error => new Error("Failed query: update books ...", { cause: inner });

describe("mapDbError", () => {
  it("surfaces the publish trigger cleanly, looking through the driver wrapper", () => {
    const mapped = mapDbError(wrapped(pgError("23514", "book x cannot be published without an approved or restricted licence", "books_publish_requires_license")));
    expect(mapped).toBeInstanceOf(AdminError);
    expect(mapped).toMatchObject({ status: 409, code: "publish_blocked" });
  });
  it("maps the licence downgrade guard", () => {
    expect(mapDbError(pgError("23514", "x", "licenses_published_requires_rights"))).toMatchObject({ code: "rights_guard", status: 409 });
  });
  it("maps other check violations, unique violations and FK violations without leaking driver text", () => {
    expect(mapDbError(pgError("23514", "secret detail", "books_slug_format_ck"))).toMatchObject({ status: 422, code: "validation_failed" });
    expect(mapDbError(pgError("23505", "dup", "books_isbn13_uq"))).toMatchObject({ code: "duplicate_isbn" });
    expect(mapDbError(pgError("23505", "dup", "assets_pdf_sha256_uq"))).toMatchObject({ code: "duplicate_checksum" });
    expect(mapDbError(pgError("23505", "dup", "books_slug_uq"))).toMatchObject({ code: "conflict" });
    const fk = mapDbError(pgError("23503", "key (id)=(1) is still referenced"));
    expect(fk).toMatchObject({ code: "in_use" });
    expect((fk as Error).message).not.toContain("key (id)");
    expect(mapDbError(pgError("23001", "restrict"))).toMatchObject({ code: "in_use" });
  });
  it("passes unknown errors through unchanged", () => {
    const e = new Error("boom");
    expect(mapDbError(e)).toBe(e);
    expect(mapDbError("string")).toBe("string");
  });
});

describe("requirePermission", () => {
  it("throws 403 AdminError for a role without the action", () => {
    const principal = { userId: "u", email: "e", role: "editor" as const, sessionId: "s" };
    expect(() => requirePermission(principal, "license.review")).toThrow(AdminError);
    expect(() => requirePermission(principal, "book.write")).not.toThrow();
  });
});
