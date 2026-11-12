/**
 * Pure helpers for the admin forms: turning form strings into the JSON the admin
 * API expects, and turning API failures into messages. No DOM, no network, so every
 * function here is unit-tested. The server remains the only validator that matters;
 * these helpers only avoid obviously wrong requests and surface server messages.
 */
import { BOOK_LEVELS, LICENSE_TYPES, RIGHTS_STATUSES, type BookLevel, type LicenseType, type RightsStatus } from "@/contracts/enums";

/** Splits on newlines and commas, trims, drops blanks and case-insensitive duplicates (first spelling wins). */
export function splitList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\n,]/)) {
    const value = part.trim();
    if (value === "") continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export const joinList = (items: readonly string[], separator = ", "): string => items.join(separator);

export type IntegerParse = { ok: true; value: number | undefined } | { ok: false };

/** Blank is "not given". Anything else must be a whole number. */
export function parseOptionalInteger(raw: string): IntegerParse {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: undefined };
  if (!/^-?\d+$/.test(trimmed)) return { ok: false };
  return { ok: true, value: Number(trimmed) };
}

const blankToUndefined = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

// ---- books -----------------------------------------------------------------

export type BookFormValues = {
  title: string;
  subtitle: string;
  description: string;
  language: string;
  isbn13: string;
  edition: string;
  publisher: string;
  publishedYear: string;
  pageCount: string;
  level: string;
  authors: string;
  categories: string[];
  technologies: string;
  tags: string;
};

export const emptyBookValues = (): BookFormValues => ({
  title: "",
  subtitle: "",
  description: "",
  language: "en",
  isbn13: "",
  edition: "",
  publisher: "",
  publishedYear: "",
  pageCount: "",
  level: "",
  authors: "",
  categories: [],
  technologies: "",
  tags: "",
});

export type PayloadResult = { payload: Record<string, unknown>; errors: Record<string, string> };

export function bookValuesToPayload(values: BookFormValues): PayloadResult {
  const errors: Record<string, string> = {};
  const year = parseOptionalInteger(values.publishedYear);
  if (!year.ok) errors["publishedYear"] = "Enter a whole number, for example 2019";
  const pages = parseOptionalInteger(values.pageCount);
  if (!pages.ok) errors["pageCount"] = "Enter a whole number";
  const authors = splitList(values.authors);
  if (authors.length === 0) errors["authors"] = "Add at least one author";
  if (values.title.trim() === "") errors["title"] = "Title is required";

  const level = (BOOK_LEVELS as readonly string[]).includes(values.level) ? (values.level as BookLevel) : undefined;
  const payload: Record<string, unknown> = {
    title: values.title.trim(),
    subtitle: blankToUndefined(values.subtitle),
    description: blankToUndefined(values.description),
    language: blankToUndefined(values.language) ?? "en",
    isbn13: blankToUndefined(values.isbn13),
    edition: blankToUndefined(values.edition),
    publisher: blankToUndefined(values.publisher),
    publishedYear: year.ok ? year.value : undefined,
    pageCount: pages.ok ? pages.value : undefined,
    level,
    authors,
    categories: values.categories,
    technologies: splitList(values.technologies).map((slug) => slug.toLowerCase()),
    tags: splitList(values.tags),
  };
  return { payload, errors };
}

// ---- licences --------------------------------------------------------------

export type LicenseFormValues = {
  rightsStatus: RightsStatus;
  licenseType: string;
  licenseUrl: string;
  rightsHolder: string;
  attributionText: string;
  sourceUrl: string;
  evidenceNote: string;
  allowRead: boolean;
  allowDownload: boolean;
  expiresAt: string;
  restrictedReason: string;
  removedReason: string;
};

export const emptyLicenseValues = (): LicenseFormValues => ({
  rightsStatus: "pending",
  licenseType: "",
  licenseUrl: "",
  rightsHolder: "",
  attributionText: "",
  sourceUrl: "",
  evidenceNote: "",
  allowRead: false,
  allowDownload: false,
  expiresAt: "",
  restrictedReason: "",
  removedReason: "",
});

export function licenseValuesToPayload(values: LicenseFormValues): PayloadResult {
  const errors: Record<string, string> = {};
  let expiresAt: string | undefined;
  if (values.expiresAt.trim() !== "") {
    const parsed = new Date(`${values.expiresAt.trim()}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) errors["expiresAt"] = "Enter a valid date";
    else expiresAt = parsed.toISOString();
  }
  const licenseType = (LICENSE_TYPES as readonly string[]).includes(values.licenseType) ? (values.licenseType as LicenseType) : undefined;
  const removed = values.rightsStatus === "removed";
  const restricted = values.rightsStatus === "restricted";
  const payload: Record<string, unknown> = {
    rightsStatus: values.rightsStatus,
    licenseType,
    licenseUrl: blankToUndefined(values.licenseUrl),
    rightsHolder: blankToUndefined(values.rightsHolder),
    attributionText: blankToUndefined(values.attributionText),
    sourceUrl: blankToUndefined(values.sourceUrl),
    evidenceNote: blankToUndefined(values.evidenceNote),
    // A removed licence can never allow anything and a restricted one never allows download; send what the rules require.
    allowRead: removed ? false : values.allowRead,
    allowDownload: removed || restricted ? false : values.allowDownload,
    expiresAt,
    restrictedReason: restricted ? blankToUndefined(values.restrictedReason) : undefined,
    removedReason: removed ? blankToUndefined(values.removedReason) : undefined,
  };
  return { payload, errors };
}

export const isRightsStatus = (value: string): value is RightsStatus => (RIGHTS_STATUSES as readonly string[]).includes(value);

// ---- API failures ----------------------------------------------------------

export type ApiFailure = {
  status: number;
  code: string;
  message: string;
  /** Field name (first path segment) to message. */
  fieldErrors: Record<string, string>;
  /** Unmet publish requirements from a `publish_blocked` error. */
  missing: string[];
  retryAfterSeconds: number | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Builds a user-facing failure from an HTTP status and whatever body came back (possibly not JSON at all). */
export function parseApiFailure(status: number, body: unknown, retryAfter: string | null = null): ApiFailure {
  const error = isRecord(body) && isRecord(body["error"]) ? body["error"] : null;
  const code = typeof error?.["code"] === "string" ? error["code"] : status >= 500 ? "internal" : "unknown";
  const serverMessage = typeof error?.["message"] === "string" ? error["message"] : null;
  const fieldErrors: Record<string, string> = {};
  let missing: string[] = [];
  const details = error?.["details"];
  if (Array.isArray(details)) {
    for (const entry of details) {
      if (isRecord(entry) && typeof entry["field"] === "string" && typeof entry["message"] === "string") {
        const key = entry["field"].split(".")[0] ?? entry["field"];
        if (key !== "" && fieldErrors[key] === undefined) fieldErrors[key] = entry["message"];
      }
    }
  } else if (isRecord(details) && Array.isArray(details["missing"])) {
    missing = details["missing"].filter((item): item is string => typeof item === "string");
  }
  const seconds = retryAfter !== null && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null;
  const fallback = status >= 500 ? "The server hit an error. Nothing was changed. Try again, and check the server log if it persists." : `The request failed (${status}).`;
  return { status, code, message: serverMessage ?? fallback, fieldErrors, missing, retryAfterSeconds: seconds };
}

export const NETWORK_FAILURE: ApiFailure = {
  status: 0,
  code: "network",
  message: "Could not reach the server. Check your connection and try again.",
  fieldErrors: {},
  missing: [],
  retryAfterSeconds: null,
};

const REQUIREMENT_TEXT: Record<string, string> = {
  title: "The book needs a title.",
  slug: "The book needs a slug.",
  not_deleted: "The book is deleted.",
  license_exists: "No licence has been recorded yet.",
  rights_approved_or_restricted: "The rights status must be approved or restricted.",
  license_not_expired: "The licence has expired.",
  rights_holder: "A rights holder is required.",
  license_type: "A licence type is required.",
  evidence: "Add a source URL or an evidence note.",
  approver: "A reviewer must approve the licence (save it as approved).",
  approved_at: "The licence has no approval time (save it as approved).",
  primary_pdf_ready: "Upload a PDF that finished processing.",
  pdf_sha256: "The PDF has no checksum recorded.",
  duplicate_resolved: "Another live book has the same ISBN or PDF. Resolve the duplicate first.",
};

export const describeRequirement = (key: string): string => REQUIREMENT_TEXT[key] ?? key.replaceAll("_", " ");

/** Message to show above a form; mentions the unmet requirements for a blocked publication. */
export function failureHeadline(failure: ApiFailure): string {
  if (failure.code === "publish_blocked") return "Not published. The licence or book does not meet the requirements.";
  if (failure.code === "rate_limited" && failure.retryAfterSeconds !== null) {
    return `${failure.message} (retry in about ${Math.max(1, Math.ceil(failure.retryAfterSeconds / 60))} min)`;
  }
  return failure.message;
}

// ---- files -----------------------------------------------------------------

export type FileKind = "pdf" | "cover";
export const COVER_HINT_MAX_BYTES = 5 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit] ?? "GB"}`;
}

/** Client-side hint only: the server checks the real bytes. Returns null when nothing looks wrong. */
export function fileHint(file: { name: string; size: number; type: string }, kind: FileKind, maxPdfBytes: number): string | null {
  if (file.size === 0) return "This file is empty.";
  if (kind === "pdf") {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return "This does not look like a PDF.";
    if (file.size > maxPdfBytes) return `This file is ${formatBytes(file.size)}; the limit is ${formatBytes(maxPdfBytes)}.`;
    return null;
  }
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) return "Covers must be PNG, JPEG or WebP.";
  if (file.size > COVER_HINT_MAX_BYTES) return `This image is ${formatBytes(file.size)}; the limit is ${formatBytes(COVER_HINT_MAX_BYTES)}.`;
  return null;
}

// ---- server records to form values ----------------------------------------

type BookLike = {
  title: string;
  subtitle: string | null;
  description: string | null;
  language: string;
  isbn13: string | null;
  edition: string | null;
  publisher: string | null;
  publishedYear: number | null;
  pageCount: number | null;
  level: string | null;
};

export function bookToFormValues(book: BookLike, relations: { authors: readonly string[]; categories: readonly string[]; technologies: readonly string[]; tags: readonly string[] }): BookFormValues {
  return {
    title: book.title,
    subtitle: book.subtitle ?? "",
    description: book.description ?? "",
    language: book.language,
    isbn13: book.isbn13 ?? "",
    edition: book.edition ?? "",
    publisher: book.publisher ?? "",
    publishedYear: book.publishedYear === null ? "" : String(book.publishedYear),
    pageCount: book.pageCount === null ? "" : String(book.pageCount),
    level: book.level ?? "",
    authors: relations.authors.join("\n"),
    categories: [...relations.categories],
    technologies: joinList(relations.technologies),
    tags: joinList(relations.tags),
  };
}

type LicenseLike = {
  rightsStatus: RightsStatus;
  licenseType: string | null;
  licenseUrl: string | null;
  rightsHolder: string | null;
  attributionText: string | null;
  sourceUrl: string | null;
  evidenceNote: string | null;
  allowRead: boolean;
  allowDownload: boolean;
  expiresAt: string | null;
  restrictedReason: string | null;
  removedReason: string | null;
};

export function licenseToFormValues(license: LicenseLike | null): LicenseFormValues {
  if (license === null) return emptyLicenseValues();
  return {
    rightsStatus: license.rightsStatus,
    licenseType: license.licenseType ?? "",
    licenseUrl: license.licenseUrl ?? "",
    rightsHolder: license.rightsHolder ?? "",
    attributionText: license.attributionText ?? "",
    sourceUrl: license.sourceUrl ?? "",
    evidenceNote: license.evidenceNote ?? "",
    allowRead: license.allowRead,
    allowDownload: license.allowDownload,
    expiresAt: license.expiresAt === null ? "" : license.expiresAt.slice(0, 10),
    restrictedReason: license.restrictedReason ?? "",
    removedReason: license.removedReason ?? "",
  };
}

// ---- generic entity forms (authors, categories, collections) ---------------

export type EntityFieldSpec = {
  name: string;
  label: string;
  kind: "text" | "textarea" | "integer" | "checkbox" | "select" | "list";
  hint?: string;
  required?: boolean;
  /** Only sent (and shown) when creating, for values that are fixed afterwards such as a public slug. */
  createOnly?: boolean;
  options?: readonly { value: string; label: string }[];
};

export type EntityValues = Record<string, string | boolean>;

export function entityInitialValues(fields: readonly EntityFieldSpec[], item: Record<string, unknown> | null): EntityValues {
  const out: EntityValues = {};
  for (const field of fields) {
    const raw = item?.[field.name];
    out[field.name] = field.kind === "checkbox" ? raw === true : raw === null || raw === undefined ? "" : String(raw);
  }
  return out;
}

export function entityValuesToPayload(fields: readonly EntityFieldSpec[], values: EntityValues, mode: "create" | "edit"): PayloadResult {
  const errors: Record<string, string> = {};
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.createOnly === true && mode === "edit") continue;
    const raw = values[field.name];
    if (field.kind === "checkbox") {
      payload[field.name] = raw === true;
      continue;
    }
    const text = typeof raw === "string" ? raw.trim() : "";
    if (field.required === true && text === "") {
      errors[field.name] = `${field.label} is required`;
      continue;
    }
    if (text === "") continue;
    if (field.kind === "integer") {
      const parsed = parseOptionalInteger(text);
      if (!parsed.ok) errors[field.name] = "Enter a whole number";
      else payload[field.name] = parsed.value;
    } else if (field.kind === "list") {
      payload[field.name] = splitList(text);
    } else {
      payload[field.name] = text;
    }
  }
  return { payload, errors };
}

// ---- takedowns -------------------------------------------------------------

export type RemovalValues = {
  reason: string;
  claimantName: string;
  claimantEmail: string;
  relationship: string;
  description: string;
  organisation: string;
};

export const emptyRemovalValues = (): RemovalValues => ({ reason: "", claimantName: "", claimantEmail: "", relationship: "", description: "", organisation: "" });

/** Body for recording a takedown received outside the public form and removing the book in one step. */
export function removalValuesToPayload(values: RemovalValues): PayloadResult {
  const errors: Record<string, string> = {};
  if (values.reason.trim().length < 3) errors["reason"] = "Give a reason of at least 3 characters";
  if (values.claimantName.trim() === "") errors["claimantName"] = "Claimant name is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.claimantEmail.trim())) errors["claimantEmail"] = "Enter a valid email address";
  if (values.relationship.trim() === "") errors["relationship"] = "Describe the claimant's relationship to the work";
  if (values.description.trim().length < 10) errors["description"] = "Describe the complaint (10 or more characters)";
  const payload: Record<string, unknown> = {
    reason: values.reason.trim(),
    claimant: {
      name: values.claimantName.trim(),
      email: values.claimantEmail.trim(),
      relationship: values.relationship.trim(),
      description: values.description.trim(),
      organisation: blankToUndefined(values.organisation),
    },
  };
  return { payload, errors };
}

/** Maps a claimant field name from the form to the server's nested path name for error display. */
export function removalFieldErrors(failure: ApiFailure): Record<string, string> {
  const out: Record<string, string> = {};
  const rename: Record<string, string> = { name: "claimantName", email: "claimantEmail", relationship: "relationship", description: "description", organisation: "organisation", reason: "reason" };
  for (const [key, message] of Object.entries(failure.fieldErrors)) out[rename[key] ?? key] = message;
  return out;
}
