"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { adminFetch } from "./api";
import { FormAlert } from "./fields";
import { formatBytes, type ApiFailure } from "./forms";
import type { ImportReportDto } from "./types";

/** The JSON request body is capped at 1 MB by the API; leave room for escaping. */
const CSV_HINT_MAX_CHARS = 900_000;

type Loaded = { filename: string; text: string };

/** Two steps: a dry run that changes nothing and lists row-level problems, then a commit of the same file. */
export function ImportForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [report, setReport] = useState<ImportReportDto | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState<"check" | "commit" | null>(null);

  async function check(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailure(null);
    setReport(null);
    const file = input.current?.files?.[0];
    if (file === undefined) {
      setHint("Choose a CSV file first.");
      return;
    }
    if (file.size === 0) {
      setHint("This file is empty.");
      return;
    }
    const text = await file.text();
    if (text.length > CSV_HINT_MAX_CHARS) {
      setHint(`This file is ${formatBytes(file.size)}; split it into files under about 900 KB.`);
      return;
    }
    setHint(null);
    setLoaded({ filename: file.name, text });
    await send({ filename: file.name, text }, true);
  }

  async function send(source: Loaded, dryRun: boolean): Promise<void> {
    setBusy(dryRun ? "check" : "commit");
    const result = await adminFetch<ImportReportDto>("POST", "/api/admin/imports", { json: { filename: source.filename, text: source.text, dryRun } });
    setBusy(null);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    setReport(result.data);
    if (!dryRun) router.refresh();
  }

  const canCommit = report !== null && report.dryRun && report.validRows > 0 && loaded !== null;

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={(event) => void check(event)} className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-5" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="csv-file" className="text-sm font-medium text-ink">CSV file</label>
          <input
            ref={input}
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            aria-describedby={hint ? "csv-file-hint" : undefined}
            aria-invalid={hint ? true : undefined}
            onChange={() => { setHint(null); setReport(null); setLoaded(null); setFailure(null); }}
            className="block w-full text-sm text-ink file:mr-3 file:rounded-pill file:border file:border-border-strong file:bg-surface-raised file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink"
          />
          {hint ? <p id="csv-file-hint" className="text-sm font-medium text-danger">{hint}</p> : null}
        </div>
        <div>
          <Button type="submit" variant="secondary" disabled={busy !== null}>{busy === "check" ? "Checking" : "Check file (nothing is saved)"}</Button>
        </div>
      </form>

      <FormAlert failure={failure} />

      {report ? (
        <section aria-labelledby="import-report" className="flex flex-col gap-4">
          <h2 id="import-report" className="text-xl">{report.dryRun ? "Dry run result" : "Import result"}</h2>
          <p role="status" className="text-sm text-ink">
            {report.dryRun
              ? `${report.totalRows} rows read. ${report.validRows} can be imported, ${report.failedRows} have errors.`
              : `${report.importedRows} of ${report.totalRows} rows imported as drafts with no rights. ${report.failedRows} failed.`}
          </p>
          {report.ignoredColumns.length > 0 ? <p className="text-sm text-ink-muted">Ignored columns: {report.ignoredColumns.join(", ")}</p> : null}
          {report.rows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised">
              <table className="w-full min-w-[34rem] text-sm">
                <caption className="sr-only">Row results</caption>
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-ink-muted">
                    <th scope="col" className="px-3 py-2 font-medium">Line</th>
                    <th scope="col" className="px-3 py-2 font-medium">Title</th>
                    <th scope="col" className="px-3 py-2 font-medium">Result</th>
                    <th scope="col" className="px-3 py-2 font-medium">Problems and notes</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.line} className="border-b border-border/60 align-top last:border-0">
                      <th scope="row" className="px-3 py-2 text-left font-normal tabular-nums">{row.line}</th>
                      <td className="px-3 py-2">{row.title ?? "none"}</td>
                      <td className="px-3 py-2">
                        <Badge tone={row.status === "error" ? "danger" : row.status === "imported" ? "success" : "accent"}>{row.status}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <ul className="flex flex-col gap-0.5">
                          {row.errors.map((issue, index) => (
                            <li key={`e${String(index)}`} className="text-danger"><span className="font-medium">{issue.field}:</span> {issue.message}</li>
                          ))}
                          {row.warnings.map((issue, index) => (
                            <li key={`w${String(index)}`} className="text-warning"><span className="font-medium">{issue.field}:</span> {issue.message}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {canCommit ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-ink-muted">Rows with errors are skipped. Imported books are drafts with no licence rights; add and approve rights before publishing.</p>
              <div>
                <Button disabled={busy !== null} onClick={() => { if (loaded) void send(loaded, false); }}>
                  {busy === "commit" ? "Importing" : `Import ${String(report.validRows)} valid ${report.validRows === 1 ? "row" : "rows"}`}
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
