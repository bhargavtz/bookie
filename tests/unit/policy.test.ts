import { describe, expect, it } from "vitest";
import { canDownload, canList, canPublish, canRead } from "@/lib/policy";
import type { BookPublishView, BookRightsView, LicenseView, Viewer } from "@/lib/policy";
import type { AssetStatus, BookStatus, RightsStatus } from "@/contracts/enums";

const NOW = new Date("2026-06-01T00:00:00Z");
const PAST = new Date("2026-01-01T00:00:00Z");
const FUTURE = new Date("2027-01-01T00:00:00Z");
const PUBLIC: Viewer = { kind: "public" };
const ADMIN: Viewer = { kind: "admin", role: "reviewer" };

type Overrides = {
  status?: BookStatus;
  deletedAt?: Date | null;
  license?: Partial<LicenseView> | null;
  asset?: AssetStatus | null;
};

function view(o: Overrides = {}): BookRightsView {
  const license: LicenseView | null =
    o.license === null
      ? null
      : { rightsStatus: "approved", allowRead: true, allowDownload: true, expiresAt: null, ...o.license };
  return {
    bookStatus: o.status ?? "published",
    deletedAt: o.deletedAt ?? null,
    license,
    primaryAsset: o.asset === null ? null : { status: o.asset ?? "ready" },
    openTakedown: false,
  };
}

const rights = (rightsStatus: RightsStatus, extra: Partial<LicenseView> = {}): Overrides => ({
  license: { rightsStatus, ...extra },
});

const allow = { allowed: true };
const deny = (reason: string, httpStatus: number) => ({ allowed: false, reason, httpStatus });

type Row = { name: string; v: Overrides; list: unknown; read: unknown; download: unknown };

const publicRows: Row[] = [
  { name: "approved, read+download", v: rights("approved"), list: allow, read: allow, download: allow },
  { name: "approved, read only", v: rights("approved", { allowDownload: false }), list: allow, read: allow, download: deny("download_not_allowed", 403) },
  { name: "approved, download only", v: rights("approved", { allowRead: false }), list: allow, read: deny("read_not_allowed", 403), download: allow },
  { name: "approved, neither flag", v: rights("approved", { allowRead: false, allowDownload: false }), list: allow, read: deny("read_not_allowed", 403), download: deny("download_not_allowed", 403) },
  { name: "restricted, read", v: rights("restricted", { allowDownload: false }), list: allow, read: allow, download: deny("license_restricted", 403) },
  { name: "restricted never downloads even if flag set", v: rights("restricted", { allowDownload: true }), list: allow, read: allow, download: deny("license_restricted", 403) },
  { name: "restricted, no read flag", v: rights("restricted", { allowRead: false }), list: allow, read: deny("read_not_allowed", 403), download: deny("license_restricted", 403) },
  { name: "pending", v: rights("pending"), list: deny("license_pending", 404), read: deny("license_pending", 404), download: deny("license_pending", 404) },
  { name: "removed", v: rights("removed", { allowRead: false, allowDownload: false }), list: deny("license_removed", 410), read: deny("license_removed", 410), download: deny("license_removed", 410) },
  { name: "removed even if book already unpublished", v: { ...rights("removed"), status: "unpublished" }, list: deny("license_removed", 410), read: deny("license_removed", 410), download: deny("license_removed", 410) },
  { name: "no licence row", v: { license: null }, list: deny("no_license", 404), read: deny("no_license", 404), download: deny("no_license", 404) },
  { name: "expired licence", v: rights("approved", { expiresAt: PAST }), list: deny("license_expired", 404), read: deny("license_expired", 404), download: deny("license_expired", 404) },
  { name: "licence expiring exactly now is expired", v: rights("approved", { expiresAt: NOW }), list: deny("license_expired", 404), read: deny("license_expired", 404), download: deny("license_expired", 404) },
  { name: "licence expiring later is valid", v: rights("approved", { expiresAt: FUTURE }), list: allow, read: allow, download: allow },
  { name: "draft", v: { status: "draft" }, list: deny("not_published", 404), read: deny("not_published", 404), download: deny("not_published", 404) },
  { name: "in_review", v: { status: "in_review" }, list: deny("not_published", 404), read: deny("not_published", 404), download: deny("not_published", 404) },
  { name: "unpublished", v: { status: "unpublished" }, list: deny("not_published", 404), read: deny("not_published", 404), download: deny("not_published", 404) },
  { name: "archived", v: { status: "archived" }, list: deny("not_published", 404), read: deny("not_published", 404), download: deny("not_published", 404) },
  { name: "soft deleted", v: { deletedAt: PAST }, list: deny("deleted", 404), read: deny("deleted", 404), download: deny("deleted", 404) },
  { name: "soft deleted and removed stays hidden", v: { deletedAt: PAST, ...rights("removed") }, list: deny("deleted", 404), read: deny("deleted", 404), download: deny("deleted", 404) },
  { name: "no primary asset", v: { asset: null }, list: deny("no_asset", 404), read: deny("no_asset", 404), download: deny("no_asset", 404) },
  ...(["uploading", "processing", "rejected", "deleted"] as const).map((s) => ({
    name: `asset ${s}`,
    v: { asset: s },
    list: deny("asset_not_ready", 404),
    read: deny("asset_not_ready", 404),
    download: deny("asset_not_ready", 404),
  })),
];

describe("public viewer matrix", () => {
  it.each(publicRows)("$name", ({ v, list, read, download }) => {
    const bookView = view(v);
    expect(canList(PUBLIC, bookView, NOW)).toEqual(list);
    expect(canRead(PUBLIC, bookView, NOW)).toEqual(read);
    expect(canDownload(PUBLIC, bookView, NOW)).toEqual(download);
  });

  it("an open takedown does not by itself deny access", () => {
    const v = { ...view(), openTakedown: true };
    expect(canRead(PUBLIC, v, NOW)).toEqual(allow);
  });
});

describe("admin viewer", () => {
  it("lists any non-deleted book, including drafts and pending licences", () => {
    expect(canList(ADMIN, view({ status: "draft", ...rights("pending") }), NOW)).toEqual(allow);
    expect(canList(ADMIN, view({ license: null }), NOW)).toEqual(allow);
    expect(canList(ADMIN, view({ deletedAt: PAST }), NOW)).toEqual(deny("deleted", 404));
  });

  it("previews unpublished books that have a ready file", () => {
    expect(canRead(ADMIN, view({ status: "draft", ...rights("pending") }), NOW)).toEqual(allow);
    expect(canRead(ADMIN, view({ license: null }), NOW)).toEqual(allow);
    expect(canRead(ADMIN, view({ ...rights("approved", { allowRead: false }) }), NOW)).toEqual(allow);
  });

  it("cannot preview deleted, removed, or file-less books", () => {
    expect(canRead(ADMIN, view({ deletedAt: PAST }), NOW)).toEqual(deny("deleted", 404));
    expect(canRead(ADMIN, view(rights("removed")), NOW)).toEqual(deny("license_removed", 410));
    expect(canRead(ADMIN, view({ asset: null }), NOW)).toEqual(deny("no_asset", 404));
    expect(canRead(ADMIN, view({ asset: "processing" }), NOW)).toEqual(deny("asset_not_ready", 404));
  });

  it("download follows licence terms; restricted, pending and missing licences never download", () => {
    expect(canDownload(ADMIN, view(), NOW)).toEqual(allow);
    expect(canDownload(ADMIN, view({ status: "draft" }), NOW)).toEqual(allow);
    expect(canDownload(ADMIN, view(rights("approved", { allowDownload: false })), NOW)).toEqual(deny("download_not_allowed", 403));
    expect(canDownload(ADMIN, view(rights("restricted")), NOW)).toEqual(deny("license_restricted", 403));
    expect(canDownload(ADMIN, view(rights("pending")), NOW)).toEqual(deny("license_pending", 404));
    expect(canDownload(ADMIN, view({ license: null }), NOW)).toEqual(deny("no_license", 404));
    expect(canDownload(ADMIN, view(rights("removed")), NOW)).toEqual(deny("license_removed", 410));
    expect(canDownload(ADMIN, view({ deletedAt: PAST }), NOW)).toEqual(deny("deleted", 404));
  });
});

function publishable(): BookPublishView {
  return {
    bookStatus: "in_review",
    deletedAt: null,
    openTakedown: false,
    slug: "my-book",
    title: "My Book",
    license: {
      rightsStatus: "approved",
      allowRead: true,
      allowDownload: false,
      expiresAt: null,
      licenseType: "cc-by",
      rightsHolder: "Project authors",
      sourceUrl: "https://example.org/source",
      evidenceNote: null,
      approvedBy: "11111111-1111-4111-8111-111111111111",
      approvedAt: PAST,
    },
    primaryAsset: { status: "ready", sha256: "a".repeat(64) },
    unresolvedDuplicate: false,
  };
}

describe("canPublish", () => {
  it("allows a fully evidenced book", () => {
    expect(canPublish(publishable(), NOW)).toEqual(allow);
  });

  it("allows restricted rights and note-only evidence", () => {
    const v = publishable();
    if (v.license === null) throw new Error("fixture");
    v.license.rightsStatus = "restricted";
    v.license.sourceUrl = null;
    v.license.evidenceNote = "Signed permission letter on file";
    expect(canPublish(v, NOW)).toEqual(allow);
  });

  const cases: { name: string; mutate: (v: BookPublishView) => void; missing: string[] }[] = [
    { name: "blank title", mutate: (v) => { v.title = "  "; }, missing: ["title"] },
    { name: "null title", mutate: (v) => { v.title = null; }, missing: ["title"] },
    { name: "no slug", mutate: (v) => { v.slug = null; }, missing: ["slug"] },
    { name: "deleted", mutate: (v) => { v.deletedAt = PAST; }, missing: ["not_deleted"] },
    {
      name: "no licence",
      mutate: (v) => { v.license = null; },
      missing: ["license_exists"],
    },
    { name: "pending", mutate: (v) => { if (v.license) v.license.rightsStatus = "pending"; }, missing: ["rights_approved_or_restricted"] },
    { name: "removed", mutate: (v) => { if (v.license) v.license.rightsStatus = "removed"; }, missing: ["rights_approved_or_restricted"] },
    { name: "expired", mutate: (v) => { if (v.license) v.license.expiresAt = PAST; }, missing: ["license_not_expired"] },
    { name: "no rights holder", mutate: (v) => { if (v.license) v.license.rightsHolder = " "; }, missing: ["rights_holder"] },
    { name: "null rights holder", mutate: (v) => { if (v.license) v.license.rightsHolder = null; }, missing: ["rights_holder"] },
    { name: "no licence type", mutate: (v) => { if (v.license) v.license.licenseType = null; }, missing: ["license_type"] },
    { name: "no evidence", mutate: (v) => { if (v.license) { v.license.sourceUrl = null; v.license.evidenceNote = ""; } }, missing: ["evidence"] },
    { name: "no approver", mutate: (v) => { if (v.license) v.license.approvedBy = null; }, missing: ["approver"] },
    { name: "no approval time", mutate: (v) => { if (v.license) v.license.approvedAt = null; }, missing: ["approved_at"] },
    { name: "no asset", mutate: (v) => { v.primaryAsset = null; }, missing: ["primary_pdf_ready", "pdf_sha256"] },
    { name: "asset not ready", mutate: (v) => { if (v.primaryAsset) v.primaryAsset.status = "processing"; }, missing: ["primary_pdf_ready"] },
    { name: "no sha256", mutate: (v) => { if (v.primaryAsset) v.primaryAsset.sha256 = null; }, missing: ["pdf_sha256"] },
    { name: "unresolved duplicate", mutate: (v) => { v.unresolvedDuplicate = true; }, missing: ["duplicate_resolved"] },
  ];

  it.each(cases)("denies: $name", ({ mutate, missing }) => {
    const v = publishable();
    mutate(v);
    expect(canPublish(v, NOW)).toEqual({
      allowed: false,
      reason: "publish_requirements_unmet",
      httpStatus: 403,
      missing,
    });
  });

  it("reports every unmet requirement at once", () => {
    const v = publishable();
    v.title = "";
    v.unresolvedDuplicate = true;
    v.primaryAsset = null;
    const result = canPublish(v, NOW);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.missing).toEqual(["title", "primary_pdf_ready", "pdf_sha256", "duplicate_resolved"]);
  });
});
