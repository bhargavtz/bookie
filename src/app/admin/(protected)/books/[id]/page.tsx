import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookForm } from "@/components/admin/BookForm";
import { PageHeader } from "@/components/admin/AdminShell";
import { FormSection } from "@/components/admin/fields";
import { bookToFormValues, licenseToFormValues } from "@/components/admin/forms";
import { LicenseForm } from "@/components/admin/LicenseForm";
import { PublishPanel } from "@/components/admin/PublishPanel";
import { BookStatusBadge, RightsBadge } from "@/components/admin/StatusBadges";
import { UploadForm } from "@/components/admin/UploadForm";
import { can } from "@/server/auth/permissions";
import { duplicatesForBook, getBookDetail, taxonomy } from "@/server/services/admin";
import { capabilitiesFor, toAssetDto, toBookDto, toLicenseDto, toRelationsDto } from "../../../_lib/dto";
import { loadOrRedirect, requireAdminPage } from "../../../_lib/session";

export const metadata: Metadata = { title: "Edit book" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, principal } = await requireAdminPage("book.read");
  if (!UUID.test(id)) notFound();
  const detail = await loadOrRedirect(() => getBookDetail(ctx, principal, id));
  const [categories, duplicates] = await Promise.all([
    loadOrRedirect(() => taxonomy.listCategories(ctx, principal)),
    can(principal.role, "duplicate.view") ? loadOrRedirect(() => duplicatesForBook(ctx, principal, id)) : Promise.resolve(null),
  ]);

  const book = toBookDto(detail.book);
  const relations = toRelationsDto(detail.relations);
  const license = detail.license === null ? null : toLicenseDto(detail.license);
  const caps = capabilitiesFor(principal.role);
  const deleted = detail.book.deletedAt !== null;
  const hasDuplicates = duplicates !== null && (duplicates.isbn.length > 0 || duplicates.checksum !== null || duplicates.similarTitles.length > 0);

  return (
    <>
      <PageHeader
        title={book.title}
        description={`/${book.slug}`}
        actions={
          <span className="flex items-center gap-2">
            <BookStatusBadge status={book.status} />
            <RightsBadge status={license?.rightsStatus ?? null} />
          </span>
        }
      />
      {deleted ? <p role="status" className="rounded-md border border-border bg-surface-sunken px-4 py-3 text-sm">This book was deleted. It is kept for the audit trail and is read-only.</p> : null}

      <FormSection id="details" title="Details" description="Metadata, authors, categories, technologies and tags.">
        <BookForm
          mode="edit"
          bookId={book.id}
          initial={bookToFormValues(book, relations)}
          categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
          readOnly={deleted || !caps.write}
        />
      </FormSection>

      <FormSection id="rights" title="Rights and licence" description="A book is only readable or downloadable when its licence says so. Nothing is assumed.">
        <LicenseForm
          key={`${license?.rightsStatus ?? "none"}-${license?.approvedAt ?? "none"}`}
          bookId={book.id}
          initial={licenseToFormValues(license)}
          reviewedAt={license?.approvedAt ?? null}
          canEdit={!deleted && can(principal.role, "license.edit")}
          canReview={can(principal.role, "license.review")}
        />
        {license?.sourceUrl || license?.licenseUrl ? (
          <p className="text-sm text-ink-muted">
            Recorded links:{" "}
            {license.sourceUrl ? <a href={license.sourceUrl} rel="noopener noreferrer nofollow" target="_blank">source</a> : null}
            {license.sourceUrl && license.licenseUrl ? ", " : null}
            {license.licenseUrl ? <a href={license.licenseUrl} rel="noopener noreferrer nofollow" target="_blank">licence</a> : null}
          </p>
        ) : null}
      </FormSection>

      <FormSection id="files" title="Files" description="Uploads are checked on the server by content, size and checksum.">
        <div className="grid gap-6 md:grid-cols-2">
          <UploadForm bookId={book.id} kind="pdf" current={detail.primaryAsset ? toAssetDto(detail.primaryAsset) : null} maxPdfBytes={ctx.maxUploadBytes} canUpload={!deleted && caps.upload} />
          <UploadForm bookId={book.id} kind="cover" current={detail.coverAsset ? toAssetDto(detail.coverAsset) : null} maxPdfBytes={ctx.maxUploadBytes} canUpload={!deleted && caps.upload} />
        </div>
      </FormSection>

      {duplicates !== null ? (
        <FormSection id="duplicates" title="Duplicate check">
          {hasDuplicates ? (
            <ul className="flex flex-col gap-2 text-sm">
              {duplicates.isbn.map((hit) => (
                <li key={`isbn-${hit.bookId}`}>Same ISBN-13: <Link href={`/admin/books/${hit.bookId}`}>{hit.title}</Link>{hit.deleted ? " (deleted)" : ""}</li>
              ))}
              {duplicates.checksum ? <li>Identical PDF: <Link href={`/admin/books/${duplicates.checksum.bookId}`}>{duplicates.checksum.title}</Link></li> : null}
              {duplicates.similarTitles.map((hit) => (
                <li key={`sim-${hit.bookId}`}>Similar title (hint only): <Link href={`/admin/books/${hit.bookId}`}>{hit.title}</Link></li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">No other book shares this ISBN or file, and no similar titles were found.</p>
          )}
        </FormSection>
      ) : null}

      {deleted ? null : (
        <FormSection id="publication" title="Publication" description="Publishing needs an approved or restricted licence, a processed PDF and no unresolved duplicate.">
          <PublishPanel bookId={book.id} status={book.status} caps={caps} />
        </FormSection>
      )}

      {can(principal.role, "takedown.manage") && !deleted ? (
        <p className="text-sm text-ink-muted">
          Rights complaint about this book? <Link href={`/admin/takedowns?book=${book.id}`}>Record a takedown</Link>.
        </p>
      ) : null}
    </>
  );
}
