import { fileErrorResponse } from "@/server/http/errors";
import type { FileOutcome } from "@/server/services/files/serve";

/** Maps a service outcome to a web Response. Shared by the inline and download routes. */
export function toResponse(outcome: FileOutcome, isHead: boolean): Response {
  if (!outcome.ok) return fileErrorResponse(outcome.error, isHead);
  return new Response(isHead ? null : outcome.body, { status: outcome.status, headers: outcome.headers });
}
