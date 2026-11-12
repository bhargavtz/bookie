import { canDownload, canRead, type Viewer } from "@/lib/policy";
import type { FileError } from "@/server/http/errors";
import { fileError } from "@/server/http/errors";
import type { BookFileRepository } from "@/server/repositories/book-files";
import { denialToError } from "./serve";

/** What the reader page needs. URLs are same-origin routes; nothing signed, nothing storage-specific. */
export type ReaderAccess = {
  slug: string;
  title: string;
  pageCount: number | null;
  fileUrl: string;
  downloadUrl: string | null;
  /** Operator-supplied https link, offered as a fallback when the file cannot be shown. */
  externalSourceUrl: string | null;
};

export type ReaderAccessOutcome = { ok: true; access: ReaderAccess } | { ok: false; error: FileError };

export async function getReaderAccess(
  slug: string,
  deps: { repository: BookFileRepository; viewer: Viewer; now: () => Date },
): Promise<ReaderAccessOutcome> {
  const record = await deps.repository.findBySlug(slug);
  if (record === null) return { ok: false, error: fileError("not_found") };
  const now = deps.now();
  const readable = canRead(deps.viewer, record.rights, now);
  if (!readable.allowed) return { ok: false, error: denialToError(readable) };
  const encoded = encodeURIComponent(record.slug);
  return {
    ok: true,
    access: {
      slug: record.slug,
      title: record.title,
      pageCount: record.pageCount,
      fileUrl: `/api/books/${encoded}/file`,
      downloadUrl: canDownload(deps.viewer, record.rights, now).allowed ? `/api/books/${encoded}/download` : null,
      externalSourceUrl: record.externalSourceUrl,
    },
  };
}
