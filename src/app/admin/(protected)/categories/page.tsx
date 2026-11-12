import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/AdminShell";
import { EntityManager } from "@/components/admin/EntityManager";
import type { EntityFieldSpec } from "@/components/admin/forms";
import { can } from "@/server/auth/permissions";
import { taxonomy } from "@/server/services/admin";
import { loadOrRedirect, requireAdminPage } from "../../_lib/session";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const { ctx, principal } = await requireAdminPage("book.read");
  const categories = await loadOrRedirect(() => taxonomy.listCategories(ctx, principal));
  const fields: EntityFieldSpec[] = [
    { name: "name", label: "Name", kind: "text", required: true },
    { name: "slug", label: "Slug", kind: "text", createOnly: true, hint: "Leave blank to derive it from the name. It cannot change later because public URLs use it." },
    { name: "description", label: "Description", kind: "textarea" },
    { name: "parentId", label: "Parent category", kind: "select", options: [{ value: "", label: "None" }, ...categories.map((c) => ({ value: c.id, label: c.name }))] },
    { name: "sortOrder", label: "Sort order", kind: "integer", hint: "Lower numbers come first." },
    { name: "iconKey", label: "Icon key", kind: "text" },
  ];
  return (
    <>
      <PageHeader title="Categories" description="Public listings use the category slug in their URL." />
      <EntityManager noun="Category" endpoint="/api/admin/categories" items={categories.map((c) => ({ ...c, summary: `/${c.slug}` }))} fields={fields} titleField="name" canManage={can(principal.role, "taxonomy.manage")} />
    </>
  );
}
