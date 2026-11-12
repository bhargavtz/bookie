"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { adminFetch } from "./api";
import { FormAlert } from "./fields";
import { fileHint, formatBytes, type ApiFailure, type FileKind } from "./forms";
import type { AssetDto } from "./types";

/**
 * File upload. The size/type message is a hint to save a round trip; the server checks the real bytes,
 * the checksum and duplicates, and its message is shown when it refuses.
 */
export function UploadForm({ bookId, kind, current, maxPdfBytes, canUpload }: { bookId: string; kind: FileKind; current: AssetDto | null; maxPdfBytes: number; canUpload: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const title = kind === "pdf" ? "PDF" : "Cover image";
  const inputId = `upload-${kind}`;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailure(null);
    setDone(null);
    const file = input.current?.files?.[0];
    if (file === undefined) {
      setHint("Choose a file first.");
      return;
    }
    const problem = fileHint(file, kind, maxPdfBytes);
    if (problem !== null) {
      setHint(problem);
      return;
    }
    setHint(null);
    const form = new FormData();
    form.set("file", file);
    setBusy(true);
    const result = await adminFetch("POST", `/api/admin/books/${bookId}/${kind}`, { form });
    setBusy(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    if (input.current) input.current.value = "";
    setDone(`${title} uploaded.${kind === "pdf" ? " A published book returns to review when its file changes." : ""}`);
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3" noValidate>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-ink-muted">
        {current ? `Current: ${current.originalFilename ?? "unnamed"} (${formatBytes(current.byteSize)}, ${current.status})` : "Nothing uploaded yet."}
        {kind === "pdf" && current?.sha256 ? <span className="block break-all">SHA-256 {current.sha256}</span> : null}
      </p>
      <FormAlert failure={failure} success={done} />
      {canUpload ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="text-sm font-medium text-ink">{current ? `Replace ${title.toLowerCase()}` : `Choose ${title.toLowerCase()}`}</label>
            <input
              ref={input}
              id={inputId}
              type="file"
              accept={kind === "pdf" ? "application/pdf,.pdf" : "image/png,image/jpeg,image/webp"}
              aria-describedby={hint ? `${inputId}-hint` : undefined}
              aria-invalid={hint ? true : undefined}
              onChange={() => { setHint(null); }}
              className="block w-full text-sm text-ink file:mr-3 file:rounded-pill file:border file:border-border-strong file:bg-surface-raised file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink"
            />
            {hint ? <p id={`${inputId}-hint`} className="text-sm font-medium text-danger">{hint}</p> : null}
          </div>
          <div>
            <Button type="submit" variant="secondary" disabled={busy}>{busy ? "Uploading" : "Upload"}</Button>
          </div>
        </>
      ) : null}
    </form>
  );
}
