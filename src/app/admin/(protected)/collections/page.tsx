import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/AdminShell";
import { EntityManager } from "@/components/admin/EntityManager";
import type { EntityFieldSpec } from "@/components/admin/forms";
import { can } from "@/server/auth/permissions";
import { taxonomy } from "@/server/services/admin";
import { loadOrRedirect, requireAdminPage } from "../../_lib/session";

export const metadata: Metadata = { title: "Collections" };

const FIELDS: EntityFieldSpec[] = [
  { name: "title", label: "Title", kind: "text", required: true },
  { name: "slug", label: "Slug", kind: "text", createOnly: true, hint: "Leave blank to derive it from the title." },
  { name: "description", label: "Description", kind: "textarea" },
  {
    name: "status",
    label: "Status",
    kind: "select",
    options: [
      { value: "draft", label: "Draft" },
      { value: "published", label: "Published" },
    ],
  },
  { name: "isFeatured", label: "Featured", kind: "checkbox" },
  { name: "bookIds", label: "Book IDs", kind: "list", hint: "Optional. Book ids (from the book page address), one per line, replace the members. Leave empty to keep the current members. Membership does not make a book public; the rights policy still decides." },
];

export default async function CollectionsPage() {
  const { ctx, principal } = await requireAdminPage("book.read");
  const collections = await loadOrRedirect(() => taxonomy.listCollections(ctx, principal));
  return (
    <>
      <PageHeader title="Collections" description="Hand-picked groups of books." />
      <EntityManager noun="Collection" endpoint="/api/admin/collections" items={collections.map((c) => ({ ...c, summary: `/${c.slug}, ${c.status}${c.isFeatured ? ", featured" : ""}` }))} fields={FIELDS} titleField="title" canManage={can(principal.role, "collection.manage")} />
    </>
  );
}
