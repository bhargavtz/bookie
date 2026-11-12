import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/AdminShell";
import { SelectField } from "@/components/admin/fields";
import { BookStatusBadge, RightsBadge, label } from "@/components/admin/StatusBadges";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { BOOK_STATUSES, RIGHTS_STATUSES, type BookStatus, type RightsStatus } from "@/contracts/enums";
import { can } from "@/server/auth/permissions";
import { getBookDetail, listBooks } from "@/server/services/admin";
import { loadOrRedirect, requireAdminPage } from "../../_lib/session";

export const metadata: Metadata = { title: "Books" };

const PAGE_SIZE = 25;
const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));

export default async function AdminBooksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, principal } = await requireAdminPage("book.read");
  const params = await searchParams;
  const q = first(params["q"]).trim().slice(0, 200);
  const statusRaw = first(params["status"]);
  const status = (BOOK_STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as BookStatus) : undefined;
  const rightsRaw = first(params["rights"]);
  const rights = rightsRaw === "none" || (RIGHTS_STATUSES as readonly string[]).includes(rightsRaw) ? (rightsRaw as RightsStatus | "none") : undefined;
  const offsetRaw = Number(first(params["offset"]));
  const offset = Number.isInteger(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;

  const page = await loadOrRedirect(() => listBooks(ctx, principal, { limit: PAGE_SIZE, offset, ...(q !== "" ? { q } : {}), ...(status !== undefined ? { status } : {}) }));
  // The list service has no rights filter; rights are read per book on this page only.
  const rows = await Promise.all(
    page.items.map(async (book) => ({ book, rightsStatus: (await loadOrRedirect(() => getBookDetail(ctx, principal, book.id))).license?.rightsStatus ?? null })),
  );
  const shown = rights === undefined ? rows : rows.filter((row) => (rights === "none" ? row.rightsStatus === null : row.rightsStatus === rights));

  const link = (nextOffset: number): string => {
    const search = new URLSearchParams();
    if (q !== "") search.set("q", q);
    if (status !== undefined) search.set("status", status);
    if (rights !== undefined) search.set("rights", rights);
    if (nextOffset > 0) search.set("offset", String(nextOffset));
    const text = search.toString();
    return text === "" ? "/admin/books" : `/admin/books?${text}`;
  };
  const from = page.total === 0 ? 0 : offset + 1;
  const to = offset + page.items.length;

  return (
    <>
      <PageHeader title="Books" actions={can(principal.role, "book.write") ? <Button href="/admin/books/new">Add book</Button> : undefined} />
      <form method="get" action="/admin/books" role="search" aria-label="Filter books" className="grid items-end gap-3 rounded-lg border border-border bg-surface-raised p-4 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]">
        <Input label="Title, ISBN or slug" name="q" defaultValue={q} />
        <SelectField label="Status" name="status" defaultValue={status ?? ""}>
          <option value="">Any status</option>
          {BOOK_STATUSES.map((value) => (
            <option key={value} value={value}>{label(value)}</option>
          ))}
        </SelectField>
        <SelectField label="Rights" name="rights" defaultValue={rights ?? ""} hint="Filters the books on this page.">
          <option value="">Any rights</option>
          <option value="none">No licence</option>
          {RIGHTS_STATUSES.map((value) => (
            <option key={value} value={value}>{label(value)}</option>
          ))}
        </SelectField>
        <Button type="submit" variant="secondary">Apply</Button>
      </form>

      {shown.length === 0 ? (
        <EmptyState title="No books match" description={q !== "" || status !== undefined || rights !== undefined ? "Try a different search or clear the filters." : "No books exist yet."} action={<Button href="/admin/books" variant="secondary">Clear filters</Button>} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">Books, newest changes first</caption>
            <thead>
              <tr className="border-b border-border bg-surface text-left text-ink-muted">
                <th scope="col" className="px-4 py-2.5 font-medium">Title</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Rights</th>
                <th scope="col" className="px-4 py-2.5 font-medium">ISBN-13</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ book, rightsStatus }) => (
                <tr key={book.id} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="px-4 py-2.5 text-left font-medium">
                    <Link href={`/admin/books/${book.id}`}>{book.title}</Link>
                  </th>
                  <td className="px-4 py-2.5"><BookStatusBadge status={book.status} /></td>
                  <td className="px-4 py-2.5"><RightsBadge status={rightsStatus} /></td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-muted">{book.isbn13 ?? "none"}</td>
                  <td className="px-4 py-2.5 text-ink-muted"><time dateTime={book.updatedAt.toISOString()}>{book.updatedAt.toISOString().slice(0, 10)}</time></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav aria-label="Pagination" className="flex items-center justify-between text-sm text-ink-muted">
        <p>{page.total === 0 ? "0 books" : `${from} to ${to} of ${page.total}`}</p>
        <div className="flex gap-2">
          {offset > 0 ? <Button href={link(Math.max(0, offset - PAGE_SIZE))} variant="secondary" size="sm">Previous</Button> : null}
          {to < page.total ? <Button href={link(offset + PAGE_SIZE)} variant="secondary" size="sm">Next</Button> : null}
        </div>
      </nav>
    </>
  );
}
