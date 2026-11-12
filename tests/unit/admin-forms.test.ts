import { describe, expect, it } from "vitest";
import {
  bookToFormValues,
  bookValuesToPayload,
  describeRequirement,
  emptyBookValues,
  emptyLicenseValues,
  emptyRemovalValues,
  entityInitialValues,
  entityValuesToPayload,
  failureHeadline,
  fileHint,
  formatBytes,
  licenseToFormValues,
  licenseValuesToPayload,
  NETWORK_FAILURE,
  parseApiFailure,
  parseOptionalInteger,
  removalValuesToPayload,
  splitList,
  type EntityFieldSpec,
} from "@/components/admin/forms";

describe("splitList", () => {
  it.each([
    ["a, b\nc", ["a", "b", "c"]],
    [" a ,, A , b ", ["a", "b"]],
    ["", []],
  ])("splits %j", (input, expected) => {
    expect(splitList(input)).toEqual(expected);
  });
});

describe("parseOptionalInteger", () => {
  it("treats blank as not given and rejects non-integers", () => {
    expect(parseOptionalInteger("  ")).toEqual({ ok: true, value: undefined });
    expect(parseOptionalInteger("2019")).toEqual({ ok: true, value: 2019 });
    expect(parseOptionalInteger("20.5")).toEqual({ ok: false });
    expect(parseOptionalInteger("abc")).toEqual({ ok: false });
  });
});

describe("bookValuesToPayload", () => {
  it("requires a title and an author and flags bad numbers", () => {
    const { errors } = bookValuesToPayload({ ...emptyBookValues(), publishedYear: "x", pageCount: "1.5" });
    expect(Object.keys(errors).sort()).toEqual(["authors", "pageCount", "publishedYear", "title"]);
  });

  it("drops blanks, lower-cases technology slugs and keeps category slugs", () => {
    const { payload, errors } = bookValuesToPayload({
      ...emptyBookValues(),
      title: "  A Title ",
      authors: "Ada, Grace",
      technologies: "TypeScript, Rust",
      tags: "x, y",
      publishedYear: "2020",
      level: "advanced",
      categories: ["web"],
      isbn13: " ",
    });
    expect(errors).toEqual({});
    expect(payload).toMatchObject({ title: "A Title", authors: ["Ada", "Grace"], technologies: ["typescript", "rust"], tags: ["x", "y"], publishedYear: 2020, level: "advanced", categories: ["web"], language: "en" });
    expect(payload["isbn13"]).toBeUndefined();
    expect(payload["subtitle"]).toBeUndefined();
  });

  it("ignores an unknown level value", () => {
    const { payload } = bookValuesToPayload({ ...emptyBookValues(), title: "T", authors: "A", level: "expert" });
    expect(payload["level"]).toBeUndefined();
  });

  it("round-trips a server record", () => {
    const values = bookToFormValues(
      { title: "T", subtitle: null, description: null, language: "en", isbn13: "9780306406157", edition: null, publisher: null, publishedYear: 2001, pageCount: null, level: "beginner" },
      { authors: ["A", "B"], categories: ["web"], technologies: ["go"], tags: ["t"] },
    );
    expect(values.authors).toBe("A\nB");
    expect(values.publishedYear).toBe("2001");
    expect(bookValuesToPayload(values).payload).toMatchObject({ authors: ["A", "B"], publishedYear: 2001, isbn13: "9780306406157" });
  });
});

describe("licenseValuesToPayload", () => {
  it("never sends download for restricted or any permission for removed licences", () => {
    const restricted = licenseValuesToPayload({ ...emptyLicenseValues(), rightsStatus: "restricted", allowRead: true, allowDownload: true, restrictedReason: "r" });
    expect(restricted.payload).toMatchObject({ allowRead: true, allowDownload: false, restrictedReason: "r" });
    const removed = licenseValuesToPayload({ ...emptyLicenseValues(), rightsStatus: "removed", allowRead: true, allowDownload: true, removedReason: "gone" });
    expect(removed.payload).toMatchObject({ allowRead: false, allowDownload: false, removedReason: "gone" });
  });

  it("converts the expiry date and rejects an invalid one", () => {
    expect(licenseValuesToPayload({ ...emptyLicenseValues(), expiresAt: "2030-01-31" }).payload["expiresAt"]).toBe("2030-01-31T00:00:00.000Z");
    expect(licenseValuesToPayload({ ...emptyLicenseValues(), expiresAt: "2030-13-45" }).errors["expiresAt"]).toBeDefined();
  });

  it("omits blank links and an unset licence type", () => {
    const { payload } = licenseValuesToPayload({ ...emptyLicenseValues(), sourceUrl: " ", licenseType: "" });
    expect(payload["sourceUrl"]).toBeUndefined();
    expect(payload["licenseType"]).toBeUndefined();
    expect(payload["rightsStatus"]).toBe("pending");
  });

  it("defaults to a deny-by-default form for a book without a licence", () => {
    expect(licenseToFormValues(null)).toEqual(emptyLicenseValues());
    expect(licenseToFormValues(null).allowRead).toBe(false);
  });
});

describe("parseApiFailure", () => {
  it("reads field errors from validation details, first path segment only", () => {
    const failure = parseApiFailure(422, { error: { code: "validation_failed", message: "Some fields are invalid", details: [{ field: "authors.0", message: "too long" }, { field: "title", message: "required" }] } });
    expect(failure.fieldErrors).toEqual({ authors: "too long", title: "required" });
  });

  it("reads the unmet requirements of a blocked publication", () => {
    const failure = parseApiFailure(409, { error: { code: "publish_blocked", message: "x", details: { missing: ["license_exists", "primary_pdf_ready"] } } });
    expect(failure.missing).toEqual(["license_exists", "primary_pdf_ready"]);
    expect(failureHeadline(failure)).toMatch(/Not published/);
    expect(describeRequirement("license_exists")).toMatch(/licence/);
    expect(describeRequirement("something_new")).toBe("something new");
  });

  it("copes with a non-JSON 500 and with Retry-After", () => {
    const failure = parseApiFailure(500, null);
    expect(failure.code).toBe("internal");
    expect(failure.message).toMatch(/Nothing was changed/);
    const limited = parseApiFailure(429, { error: { code: "rate_limited", message: "Too many attempts" } }, "900");
    expect(limited.retryAfterSeconds).toBe(900);
    expect(failureHeadline(limited)).toContain("15 min");
  });

  it("has a network failure that says so", () => {
    expect(NETWORK_FAILURE.status).toBe(0);
    expect(NETWORK_FAILURE.message).toMatch(/Could not reach/);
  });
});

describe("fileHint", () => {
  const MAX = 10 * 1024 * 1024;
  it("hints at wrong types and sizes but never blocks a plausible file", () => {
    expect(fileHint({ name: "a.pdf", size: 100, type: "application/pdf" }, "pdf", MAX)).toBeNull();
    expect(fileHint({ name: "a.txt", size: 100, type: "text/plain" }, "pdf", MAX)).toMatch(/PDF/);
    expect(fileHint({ name: "a.pdf", size: MAX + 1, type: "application/pdf" }, "pdf", MAX)).toMatch(/limit/);
    expect(fileHint({ name: "a.pdf", size: 0, type: "application/pdf" }, "pdf", MAX)).toMatch(/empty/);
    expect(fileHint({ name: "c.png", size: 100, type: "image/png" }, "cover", MAX)).toBeNull();
    expect(fileHint({ name: "c.gif", size: 100, type: "image/gif" }, "cover", MAX)).toMatch(/PNG/);
    expect(fileHint({ name: "c.png", size: 6 * 1024 * 1024, type: "image/png" }, "cover", MAX)).toMatch(/limit/);
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(200 * 1024 * 1024)).toBe("200 MB");
  });
});

describe("entity forms", () => {
  const fields: EntityFieldSpec[] = [
    { name: "name", label: "Name", kind: "text", required: true },
    { name: "slug", label: "Slug", kind: "text", createOnly: true },
    { name: "sortOrder", label: "Order", kind: "integer" },
    { name: "isFeatured", label: "Featured", kind: "checkbox" },
    { name: "bookIds", label: "Books", kind: "list" },
  ];

  it("requires required fields and validates integers", () => {
    const initial = entityInitialValues(fields, null);
    expect(entityValuesToPayload(fields, initial, "create").errors["name"]).toBeDefined();
    expect(entityValuesToPayload(fields, { ...initial, name: "N", sortOrder: "x" }, "create").errors["sortOrder"]).toBeDefined();
  });

  it("omits create-only fields when editing and keeps blanks out", () => {
    const values = { ...entityInitialValues(fields, null), name: "N", slug: "n", bookIds: "a\nb", isFeatured: true };
    expect(entityValuesToPayload(fields, values, "create").payload).toEqual({ name: "N", slug: "n", isFeatured: true, bookIds: ["a", "b"] });
    expect(entityValuesToPayload(fields, values, "edit").payload).toEqual({ name: "N", isFeatured: true, bookIds: ["a", "b"] });
  });

  it("fills initial values from a record", () => {
    expect(entityInitialValues(fields, { name: "X", sortOrder: 3, isFeatured: true })).toMatchObject({ name: "X", sortOrder: "3", isFeatured: true, slug: "" });
  });
});

describe("removalValuesToPayload", () => {
  it("collects every missing field", () => {
    expect(Object.keys(removalValuesToPayload(emptyRemovalValues()).errors).sort()).toEqual(["claimantEmail", "claimantName", "description", "reason", "relationship"]);
  });

  it("builds the nested claimant body", () => {
    const { payload, errors } = removalValuesToPayload({ reason: "Rights holder objected", claimantName: "A B", claimantEmail: "a@example.org", relationship: "author", description: "This is my work.", organisation: "" });
    expect(errors).toEqual({});
    expect(payload).toEqual({ reason: "Rights holder objected", claimant: { name: "A B", email: "a@example.org", relationship: "author", description: "This is my work.", organisation: undefined } });
  });
});
