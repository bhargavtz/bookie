/**
 * The one rights policy. No route, page, sitemap, search query, OG image or
 * file handler may decide access on its own: call these (directly or through a
 * service that does). Pure and time-injected so it is table-testable.
 *
 * Public rules (docs/architecture.md section 4.3):
 *   none/pending/expired licence -> hidden (404)
 *   approved   -> listed; read if allow_read; download if allow_download
 *   restricted -> listed; read if allow_read; never download
 *   removed    -> 410 tombstone
 * plus for every positive result: status=published, not soft-deleted, primary
 * asset ready.
 */
import type {
  Allowed,
  BookPublishView,
  BookRightsView,
  Denied,
  LicenseView,
  PolicyDecision,
  PolicyReason,
  PublishDecision,
  PublishRequirement,
  Viewer,
} from "./types";

export type * from "./types";

const ALLOWED: Allowed = { allowed: true };

function deny(reason: PolicyReason, httpStatus: Denied["httpStatus"]): Denied {
  return { allowed: false, reason, httpStatus };
}

type Blocked = { ok: false; denied: Denied };
type PublicGate = { ok: true; license: LicenseView } | Blocked;
type AdminGateResult = { ok: true; license: LicenseView | null } | Blocked;

const blocked = (reason: PolicyReason, httpStatus: Denied["httpStatus"]): Blocked => ({
  ok: false,
  denied: deny(reason, httpStatus),
});

/** Shared public visibility gate (everything except the per-action flags). */
function publicGate(view: BookRightsView, now: Date): PublicGate {
  if (view.deletedAt !== null) return blocked("deleted", 404);
  const license = view.license;
  if (license === null) return blocked("no_license", 404);
  if (license.rightsStatus === "removed") return blocked("license_removed", 410);
  if (view.bookStatus !== "published") return blocked("not_published", 404);
  if (license.rightsStatus === "pending") return blocked("license_pending", 404);
  if (license.expiresAt !== null && license.expiresAt.getTime() <= now.getTime()) {
    return blocked("license_expired", 404);
  }
  if (view.primaryAsset === null) return blocked("no_asset", 404);
  if (view.primaryAsset.status !== "ready") return blocked("asset_not_ready", 404);
  return { ok: true, license };
}

/** Admin preview: sees any non-deleted book with a ready file, never a removed one. */
function adminGate(view: BookRightsView): AdminGateResult {
  if (view.deletedAt !== null) return blocked("deleted", 404);
  if (view.license?.rightsStatus === "removed") return blocked("license_removed", 410);
  if (view.primaryAsset === null) return blocked("no_asset", 404);
  if (view.primaryAsset.status !== "ready") return blocked("asset_not_ready", 404);
  return { ok: true, license: view.license };
}

/** Appears in catalogue, search, sitemap, collections. Public lists only; admin lists are admin routes. */
export function canList(viewer: Viewer, view: BookRightsView, now: Date): PolicyDecision {
  if (viewer.kind === "admin") return view.deletedAt !== null ? deny("deleted", 404) : ALLOWED;
  const gate = publicGate(view, now);
  return gate.ok ? ALLOWED : gate.denied;
}

/** Inline PDF stream and reader page. */
export function canRead(viewer: Viewer, view: BookRightsView, now: Date): PolicyDecision {
  if (viewer.kind === "admin") {
    const gate = adminGate(view);
    return gate.ok ? ALLOWED : gate.denied;
  }
  const gate = publicGate(view, now);
  if (!gate.ok) return gate.denied;
  return gate.license.allowRead ? ALLOWED : deny("read_not_allowed", 403);
}

function downloadByLicense(license: LicenseView): PolicyDecision {
  if (license.rightsStatus === "restricted") return deny("license_restricted", 403);
  if (license.rightsStatus !== "approved") return deny("license_pending", 404);
  return license.allowDownload ? ALLOWED : deny("download_not_allowed", 403);
}

/** Attachment stream or presigned redirect. Restricted licences never download, for anyone. */
export function canDownload(viewer: Viewer, view: BookRightsView, now: Date): PolicyDecision {
  if (viewer.kind === "admin") {
    const gate = adminGate(view);
    if (!gate.ok) return gate.denied;
    return gate.license === null ? deny("no_license", 404) : downloadByLicense(gate.license);
  }
  const gate = publicGate(view, now);
  return gate.ok ? downloadByLicense(gate.license) : gate.denied;
}

const nonEmpty = (v: string | null | undefined): boolean => v !== null && v !== undefined && v.trim().length > 0;

/** Admin action precondition. Reports every unmet requirement, not just the first. */
export function canPublish(view: BookPublishView, now: Date): PublishDecision {
  const missing: PublishRequirement[] = [];
  const license = view.license;

  if (!nonEmpty(view.title)) missing.push("title");
  if (!nonEmpty(view.slug)) missing.push("slug");
  if (view.deletedAt !== null) missing.push("not_deleted");

  if (license === null) {
    missing.push("license_exists");
  } else {
    if (license.rightsStatus !== "approved" && license.rightsStatus !== "restricted") {
      missing.push("rights_approved_or_restricted");
    }
    if (license.expiresAt !== null && license.expiresAt.getTime() <= now.getTime()) {
      missing.push("license_not_expired");
    }
    if (!nonEmpty(license.rightsHolder)) missing.push("rights_holder");
    if (license.licenseType === null) missing.push("license_type");
    if (!nonEmpty(license.sourceUrl) && !nonEmpty(license.evidenceNote)) missing.push("evidence");
    if (license.approvedBy === null) missing.push("approver");
    if (license.approvedAt === null) missing.push("approved_at");
  }

  if (view.primaryAsset === null || view.primaryAsset.status !== "ready") missing.push("primary_pdf_ready");
  if (!nonEmpty(view.primaryAsset?.sha256)) missing.push("pdf_sha256");
  if (view.unresolvedDuplicate) missing.push("duplicate_resolved");

  if (missing.length === 0) return ALLOWED;
  return { allowed: false, reason: "publish_requirements_unmet", httpStatus: 403, missing };
}
