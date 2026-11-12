import { desc, eq } from "drizzle-orm";
import type { ImportJobStatus } from "@/contracts/enums";
import type { Db } from "@/server/db/client";
import { importJobs } from "@/server/db/schema";

export type ImportJobRecord = {
  id: string;
  filename: string;
  status: ImportJobStatus;
  dryRun: boolean;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  errorReport: unknown;
  createdAt: Date;
};

export async function insertImportJob(
  db: Db,
  values: { adminUserId: string; filename: string; dryRun: boolean; totalRows: number },
): Promise<string> {
  const rows = await db
    .insert(importJobs)
    .values({ ...values, status: "running" })
    .returning({ id: importJobs.id });
  const row = rows[0];
  if (row === undefined) throw new Error("import job insert returned no row");
  return row.id;
}

export async function finishImportJob(
  db: Db,
  id: string,
  values: { status: ImportJobStatus; importedRows: number; failedRows: number; errorReport: unknown },
): Promise<void> {
  await db.update(importJobs).set(values).where(eq(importJobs.id, id));
}

export async function listImportJobs(db: Db, limit: number): Promise<ImportJobRecord[]> {
  return db.select().from(importJobs).orderBy(desc(importJobs.createdAt)).limit(limit);
}
