import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import type { AdminNavItem } from "@/components/admin/AdminNav";
import { can } from "@/server/auth/permissions";
import { requireAdminPage } from "../_lib/session";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Bookie admin" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Server-side session check. Without a valid session nothing below renders and the visitor is sent to /admin/login. */
export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const { principal } = await requireAdminPage("stats.view");
  const role = principal.role;
  const nav: AdminNavItem[] = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/books", label: "Books" },
    ...(can(role, "book.write") ? [{ href: "/admin/books/new", label: "Add book" }] : []),
    { href: "/admin/authors", label: "Authors" },
    { href: "/admin/categories", label: "Categories" },
    { href: "/admin/collections", label: "Collections" },
    ...(can(role, "import.run") ? [{ href: "/admin/import", label: "CSV import" }] : []),
    ...(can(role, "duplicate.view") ? [{ href: "/admin/duplicates", label: "Duplicates" }] : []),
    ...(can(role, "takedown.manage") ? [{ href: "/admin/takedowns", label: "Takedowns" }] : []),
  ];
  return (
    <AdminShell email={principal.email} role={principal.role} nav={nav}>
      {children}
    </AdminShell>
  );
}
