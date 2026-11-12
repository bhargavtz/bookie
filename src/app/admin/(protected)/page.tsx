import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/AdminShell";
import { BookStatusBadge, label } from "@/components/admin/StatusBadges";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getOverview, listBooks } from "@/server/services/admin";
import { loadOrRedirect, requireAdminPage } from "../_lib/session";

export const metadata: Metadata = { title: "Overview" };

const number = new Intl.NumberFormat("en-US");

function Stat({ name, value, note }: { name: string; value: number; note?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-ink-muted">{name}</p>
      <p className="mt-1 text-3xl font-semibold text-ink tabular-nums">{number.format(value)}</p>
      {note ? <p className="mt-1 text-xs text-ink-muted">{note}</p> : null}
    </Card>
  );
}

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, principal } = await requireAdminPage("stats.view");
  const [stats, recent, params] = await Promise.all([
    loadOrRedirect(() => getOverview(ctx, principal)),
    loadOrRedirect(() => listBooks(ctx, principal, { limit: 6 })),
    searchParams,
  ]);
  const denied = params["denied"] !== undefined;

  return (
    <>
      <PageHeader title="Overview" description="Live counts from the catalogue. A book filed under two categories counts once in each category and once in the total." />
      {denied ? (
        <p role="alert" className="rounded-md border border-warning/40 bg-warning-subtle px-4 py-3 text-sm text-ink">
          Your role is not permitted to open that page.
        </p>
      ) : null}

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat name="Books" value={stats.totalBooks} />
        <Stat name="Awaiting review" value={stats.awaitingReview} />
        <Stat name="Open takedowns" value={stats.openTakedowns} />
        <Stat name="Downloads served" value={stats.downloads.total} note={`${number.format(stats.downloads.last30Days)} in the last 30 days`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card as="section" className="p-5">
          <h2 className="text-xl">Books by category</h2>
          {stats.booksByCategory.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">No categories exist yet.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <caption className="sr-only">Distinct books per category</caption>
              <thead>
                <tr className="border-b border-border text-left text-ink-muted">
                  <th scope="col" className="py-1.5 pr-2 font-medium">Category</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Books</th>
                </tr>
              </thead>
              <tbody>
                {stats.booksByCategory.map((row) => (
                  <tr key={row.categoryId} className="border-b border-border/60 last:border-0">
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal">{row.name}</th>
                    <td className="py-1.5 text-right tabular-nums">{number.format(row.books)}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal text-ink-muted">Uncategorised</th>
                  <td className="py-1.5 text-right tabular-nums text-ink-muted">{number.format(stats.uncategorisedBooks)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card as="section" className="p-5">
            <h2 className="text-xl">Status and rights</h2>
            <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-ink">Status</p>
                <dl>
                {Object.entries(stats.booksByStatus).map(([key, value]) => (
                  <div key={key} className="flex justify-between border-b border-border/60 py-1 last:border-0">
                    <dt className="text-ink-muted">{label(key)}</dt>
                    <dd className="tabular-nums">{number.format(value)}</dd>
                  </div>
                ))}
                </dl>
              </div>
              <div>
                <p className="font-medium text-ink">Rights</p>
                <dl>
                {Object.entries(stats.booksByRights).map(([key, value]) => (
                  <div key={key} className="flex justify-between border-b border-border/60 py-1 last:border-0">
                    <dt className="text-ink-muted">{key === "none" ? "no licence" : label(key)}</dt>
                    <dd className="tabular-nums">{number.format(value)}</dd>
                  </div>
                ))}
                </dl>
              </div>
            </div>
          </Card>

          <Card as="section" className="p-5">
            <h2 className="text-xl">Most downloaded</h2>
            {stats.downloads.topBooks.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">No downloads recorded yet.</p>
            ) : (
              <ol className="mt-3 flex flex-col gap-1 text-sm">
                {stats.downloads.topBooks.slice(0, 5).map((row) => (
                  <li key={row.bookId} className="flex justify-between gap-3">
                    <Link href={`/admin/books/${row.bookId}`} className="min-w-0 truncate">{row.title}</Link>
                    <span className="tabular-nums text-ink-muted">{number.format(row.downloads)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="recent-heading" className="text-xl">Recently updated</h2>
          <Link href="/admin/books" className="text-sm">All books</Link>
        </div>
        {recent.items.length === 0 ? (
          <EmptyState title="No books yet" description="Add a book or import a CSV to start the catalogue." />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
            {recent.items.map((book) => (
              <li key={book.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <Link href={`/admin/books/${book.id}`} className="font-medium">{book.title}</Link>
                <span className="flex items-center gap-3 text-sm text-ink-muted">
                  <BookStatusBadge status={book.status} />
                  <time dateTime={book.updatedAt.toISOString()}>{book.updatedAt.toISOString().slice(0, 10)}</time>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
