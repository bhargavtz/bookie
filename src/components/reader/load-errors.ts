/** Maps a pdf.js loading failure to a reader state and a message a reader can act on. Pure. */

export type LoadFailureKind = "password" | "corrupt" | "unavailable" | "forbidden" | "rate-limited" | "network" | "unknown";

export type LoadFailure = { kind: LoadFailureKind; message: string; retryable: boolean };

const FAILURES: Record<LoadFailureKind, LoadFailure> = {
  password: { kind: "password", message: "This PDF is password protected.", retryable: false },
  corrupt: {
    kind: "corrupt",
    message: "This file could not be opened because it is damaged or is not a valid PDF.",
    retryable: false,
  },
  unavailable: { kind: "unavailable", message: "The file for this title is not available right now.", retryable: true },
  forbidden: { kind: "forbidden", message: "Reading this title online is not permitted.", retryable: false },
  "rate-limited": { kind: "rate-limited", message: "Too many requests. Please wait a moment and try again.", retryable: true },
  network: { kind: "network", message: "The connection was interrupted while loading the book.", retryable: true },
  unknown: { kind: "unknown", message: "Something went wrong while opening the book.", retryable: true },
};

export function classifyLoadError(error: unknown): LoadFailure {
  const name = error instanceof Error ? error.name : "";
  const status = typeof (error as { status?: unknown } | null)?.status === "number" ? (error as { status: number }).status : null;
  if (name === "PasswordException") return FAILURES.password;
  if (name === "InvalidPDFException" || name === "FormatError") return FAILURES.corrupt;
  if (name === "MissingPDFException" || status === 404 || status === 410) return FAILURES.unavailable;
  if (status === 403) return FAILURES.forbidden;
  if (status === 429) return FAILURES["rate-limited"];
  if (status !== null && status >= 500) return FAILURES.unavailable;
  if (error instanceof TypeError || name === "UnexpectedResponseException") return FAILURES.network;
  return FAILURES.unknown;
}

/** Only https links are ever offered as an external fallback. */
export function safeExternalHref(url: string | null): string | null {
  if (url === null) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}
