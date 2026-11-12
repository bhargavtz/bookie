import { compareForDuplicate } from "@/lib/duplicates";
import type { AdminPrincipal } from "@/server/auth/session";
import { findBooksByIsbn, findSimilarTitles, getBook, type DuplicateHit } from "@/server/repositories/admin/books";
import { checksumDuplicateGroups, isbnDuplicateGroups, type DuplicateGroup } from "@/server/repositories/admin/duplicates";
import { findLivePdfBySha256, getAsset } from "@/server/repositories/admin/assets";
import type { AdminContext } from "./context";
import { notFound, requirePermission } from "./errors";

export type DuplicateReport = { isbn: DuplicateGroup[]; checksum: DuplicateGroup[] };

/** Library-wide scan: identical ISBN-13 or identical PDF checksum across books. */
export async function scanDuplicates(ctx: AdminContext, principal: AdminPrincipal): Promise<DuplicateReport> {
  requirePermission(principal, "duplicate.view");
  const [isbn, checksum] = await Promise.all([isbnDuplicateGroups(ctx.db), checksumDuplicateGroups(ctx.db)]);
  return { isbn, checksum };
}

export type BookDuplicateMatches = {
  isbn: DuplicateHit[];
  checksum: { bookId: string; title: string } | null;
  similarTitles: (DuplicateHit & { score: number })[];
};

/** Matches for one book. ISBN and checksum are exact; titles are advisory hints only. */
export async function duplicatesForBook(ctx: AdminContext, principal: AdminPrincipal, bookId: string): Promise<BookDuplicateMatches> {
  requirePermission(principal, "duplicate.view");
  const book = await getBook(ctx.db, bookId);
  if (book === null) throw notFound("Book");
  const primary = book.primaryAssetId === null ? null : await getAsset(ctx.db, book.primaryAssetId);
  const isbn = book.isbn13 === null ? [] : await findBooksByIsbn(ctx.db, book.isbn13, bookId);
  const sameFile = primary?.sha256 ? await findLivePdfBySha256(ctx.db, primary.sha256) : null;
  const candidates = await findSimilarTitles(ctx.db, book.title, bookId, 20);
  const similarTitles = candidates.flatMap((candidate) => {
    const match = compareForDuplicate({ title: book.title }, { title: candidate.title });
    return match === null ? [] : [{ ...candidate, score: match.score }];
  });
  return {
    isbn,
    checksum: sameFile !== null && sameFile.bookId !== bookId ? { bookId: sameFile.bookId, title: sameFile.title } : null,
    similarTitles,
  };
}
