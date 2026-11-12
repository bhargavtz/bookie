import type { Metadata } from "next";
import { BookForm } from "@/components/admin/BookForm";
import { PageHeader } from "@/components/admin/AdminShell";
import { emptyBookValues } from "@/components/admin/forms";
import { Card } from "@/components/ui/Card";
import { taxonomy } from "@/server/services/admin";
import { loadOrRedirect, requireAdminPage } from "../../../_lib/session";

export const metadata: Metadata = { title: "Add book" };

export default async function NewBookPage() {
  const { ctx, principal } = await requireAdminPage("book.write");
  const categories = await loadOrRedirect(() => taxonomy.listCategories(ctx, principal));
  return (
    <>
      <PageHeader title="Add book" description="New books are drafts with no rights. Upload the file and record the licence on the next page." />
      <Card>
        <BookForm mode="create" initial={emptyBookValues()} categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} />
      </Card>
    </>
  );
}
