import { z } from "zod";
import { LICENSE_TYPES, RIGHTS_STATUSES } from "./enums";
import { externalUrlSchema, optionalText } from "./primitives";

/**
 * Rights record as submitted by an admin. The cross-field rules mirror the DB
 * CHECK constraints so the UI gets a field-level error before the database does.
 */
export const licenseInputSchema = z
  .object({
    rightsStatus: z.enum(RIGHTS_STATUSES).default("pending"),
    licenseType: z.enum(LICENSE_TYPES).optional(),
    licenseUrl: externalUrlSchema.optional(),
    rightsHolder: optionalText(300),
    attributionText: optionalText(1000),
    sourceUrl: externalUrlSchema.optional(),
    evidenceNote: optionalText(4000),
    allowRead: z.boolean().default(false),
    allowDownload: z.boolean().default(false),
    expiresAt: z.coerce.date().optional(),
    restrictedReason: optionalText(1000),
    removedReason: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string): void => {
      ctx.addIssue({ code: "custom", path: [path], message });
    };
    if (v.rightsStatus === "restricted" && v.allowDownload) {
      issue("allowDownload", "restricted licences cannot allow download");
    }
    if (v.rightsStatus === "removed" && (v.allowRead || v.allowDownload)) {
      issue("allowRead", "removed licences cannot allow read or download");
    }
    if (v.rightsStatus === "approved") {
      if (v.licenseType === undefined) issue("licenseType", "required to approve");
      if (v.rightsHolder === undefined) issue("rightsHolder", "required to approve");
    }
    if (v.rightsStatus === "restricted" && v.restrictedReason === undefined) {
      issue("restrictedReason", "required when restricting");
    }
    if (v.rightsStatus === "removed" && v.removedReason === undefined) {
      issue("removedReason", "required when removing");
    }
  });
export type LicenseInput = z.output<typeof licenseInputSchema>;
