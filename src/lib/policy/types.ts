import type { AdminRole, AssetStatus, BookStatus, LicenseType, RightsStatus } from "@/contracts/enums";

export type Viewer = { kind: "public" } | { kind: "admin"; role: AdminRole };

export type LicenseView = {
  rightsStatus: RightsStatus;
  allowRead: boolean;
  allowDownload: boolean;
  expiresAt: Date | null;
};

/** What the access decisions (list/read/download) need to know about a book. */
export type BookRightsView = {
  bookStatus: BookStatus;
  deletedAt: Date | null;
  license: LicenseView | null;
  primaryAsset: { status: AssetStatus } | null;
  /** Informational: an open takedown request does not by itself deny access. */
  openTakedown: boolean;
};

/** Extra facts canPublish needs. Superset of BookRightsView. */
export type BookPublishView = Omit<BookRightsView, "license" | "primaryAsset"> & {
  slug: string | null;
  title: string | null;
  license:
    | (LicenseView & {
        licenseType: LicenseType | null;
        rightsHolder: string | null;
        sourceUrl: string | null;
        evidenceNote: string | null;
        approvedBy: string | null;
        approvedAt: Date | null;
      })
    | null;
  primaryAsset: { status: AssetStatus; sha256: string | null } | null;
  unresolvedDuplicate: boolean;
};

export type PolicyReason =
  | "deleted"
  | "no_license"
  | "license_pending"
  | "license_expired"
  | "license_removed"
  | "not_published"
  | "no_asset"
  | "asset_not_ready"
  | "read_not_allowed"
  | "download_not_allowed"
  | "license_restricted"
  | "publish_requirements_unmet";

export type PolicyHttpStatus = 403 | 404 | 410;

export type Allowed = { allowed: true };
export type Denied = { allowed: false; reason: PolicyReason; httpStatus: PolicyHttpStatus };
export type PolicyDecision = Allowed | Denied;

export type PublishRequirement =
  | "title"
  | "slug"
  | "not_deleted"
  | "license_exists"
  | "rights_approved_or_restricted"
  | "license_not_expired"
  | "rights_holder"
  | "license_type"
  | "evidence"
  | "approver"
  | "approved_at"
  | "primary_pdf_ready"
  | "pdf_sha256"
  | "duplicate_resolved";

export type PublishDecision =
  | Allowed
  | (Denied & { reason: "publish_requirements_unmet"; missing: PublishRequirement[] });
