import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/AdminShell";
import { TakedownManager } from "@/components/admin/TakedownManager";
import { listBooks, listTakedownRequests } from "@/server/services/admin";
import { toTakedownDto } from "../../_lib/dto";
import { loadOrRedirect, requireAdminPage } from "../../_lib/session";

export const metadata: Metadata = { title: "Takedowns" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TakedownsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, principal } = await requireAdminPage("takedown.manage");
  const params = await searchParams;
  const bookParam = typeof params["book"] === "string" ? params["book"] : "";
  const [requests, books] = await Promise.all([
    loadOrRedirect(() => listTakedownRequests(ctx, principal, { limit: 100 })),
    loadOrRedirect(() => listBooks(ctx, principal, { limit: 100 })),
  ]);
  const titles = new Map(books.items.map((book) => [book.id, book.title]));
  return (
    <>
      <PageHeader title="Takedowns" description="Rights complaints. Upholding a request removes the book from public access straight away." />
      <TakedownManager
        requests={requests.map((request) => toTakedownDto(request, request.bookId === null ? null : (titles.get(request.bookId) ?? null)))}
        books={books.items.map((book) => ({ id: book.id, title: book.title }))}
        initialBookId={UUID.test(bookParam) && titles.has(bookParam.toLowerCase()) ? bookParam.toLowerCase() : ""}
      />
      {books.total > books.items.length ? <p className="text-sm text-ink-muted">The book list shows the 100 most recently changed books of {books.total}.</p> : null}
    </>
  );
}
