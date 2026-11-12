import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/AdminShell";
import { EntityManager } from "@/components/admin/EntityManager";
import type { EntityFieldSpec } from "@/components/admin/forms";
import { can } from "@/server/auth/permissions";
import { taxonomy } from "@/server/services/admin";
import { loadOrRedirect, requireAdminPage } from "../../_lib/session";

export const metadata: Metadata = { title: "Authors" };

const FIELDS: EntityFieldSpec[] = [
  { name: "name", label: "Name", kind: "text", required: true },
  { name: "bio", label: "Biography", kind: "textarea" },
];

export default async function AuthorsPage() {
  const { ctx, principal } = await requireAdminPage("book.read");
  const authors = await loadOrRedirect(() => taxonomy.listAuthors(ctx, principal));
  return (
    <>
      <PageHeader title="Authors" description="Authors are linked to books by name from the book editor; this page edits the author record itself." />
      <EntityManager noun="Author" endpoint="/api/admin/authors" items={authors.map((a) => ({ ...a, summary: `/${a.slug}` }))} fields={FIELDS} titleField="name" canManage={can(principal.role, "taxonomy.manage")} />
    </>
  );
}
