import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { scanDuplicates } from "@/server/services/admin";
import { loadOrRedirect, requireAdminPage } from "../../_lib/session";

export const metadata: Metadata = { title: "Duplicates" };

type Group = { key: string; books: { bookId: string; title: string; deleted: boolean }[] };

function GroupList({ heading, groups, keyLabel }: { heading: string; groups: readonly Group[]; keyLabel: string }) {
  return (
    <section aria-label={heading} className="flex flex-col gap-3">
      <h2 className="text-xl">{heading}</h2>
      {groups.length === 0 ? (
        <EmptyState title="No duplicates found" description={`No two books share a ${keyLabel}.`} />
      ) : (
        groups.map((group) => (
          <Card key={group.key} className="p-4">
            <p className="break-all text-sm text-ink-muted">{keyLabel}: <span className="font-mono text-ink">{group.key}</span></p>
            <ul className="mt-2 flex flex-col gap-1">
              {group.books.map((book) => (
                <li key={book.bookId}>
                  <Link href={`/admin/books/${book.bookId}`}>{book.title}</Link>
                  {book.deleted ? <span className="text-sm text-ink-muted"> (deleted)</span> : null}
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </section>
  );
}

export default async function DuplicatesPage() {
  const { ctx, principal } = await requireAdminPage("duplicate.view");
  const report = await loadOrRedirect(() => scanDuplicates(ctx, principal));
  return (
    <>
      <PageHeader title="Duplicates" description="Exact matches only: the same ISBN-13, or the identical PDF file. A book with an unresolved duplicate cannot be published." />
      <GroupList heading="Same ISBN-13" groups={report.isbn} keyLabel="ISBN-13" />
      <GroupList heading="Same PDF checksum" groups={report.checksum} keyLabel="SHA-256" />
    </>
  );
}
