import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/AdminShell";
import { ImportForm } from "@/components/admin/ImportForm";
import { CSV_COLUMNS, REQUIRED_CSV_COLUMNS } from "@/lib/csv";
import { requireAdminPage } from "../../_lib/session";

export const metadata: Metadata = { title: "CSV import" };

export default async function ImportPage() {
  await requireAdminPage("import.run");
  return (
    <>
      <PageHeader title="CSV import" description="Imports book metadata only, as drafts with no rights. No files are fetched from any link in the CSV." />
      <p className="text-sm text-ink-muted">
        Columns: {CSV_COLUMNS.map((column) => (REQUIRED_CSV_COLUMNS.some((required) => required === column) ? `${column} (required)` : column)).join(", ")}. List columns separate values with a semicolon or a pipe.
      </p>
      <ImportForm />
    </>
  );
}
