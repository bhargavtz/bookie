"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { adminFetch } from "./api";
import { CheckboxField, FormAlert, FormSection, SelectField, TextAreaField } from "./fields";
import { emptyRemovalValues, removalFieldErrors, removalValuesToPayload, type ApiFailure, type RemovalValues } from "./forms";
import { TakedownBadge } from "./StatusBadges";
import type { BookOptionDto, TakedownDto } from "./types";

function RemovalForm({ books, initialBookId }: { books: readonly BookOptionDto[]; initialBookId: string }) {
  const router = useRouter();
  const [bookId, setBookId] = useState(initialBookId);
  const [values, setValues] = useState<RemovalValues>(emptyRemovalValues());
  const [confirmed, setConfirmed] = useState(false);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errors = { ...localErrors, ...(failure ? removalFieldErrors(failure) : {}) };
  const set = (key: keyof RemovalValues, value: string): void => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailure(null);
    setDone(null);
    const { payload, errors: found } = removalValuesToPayload(values);
    if (bookId === "") found["book"] = "Choose the book";
    if (!confirmed) found["confirm"] = "Confirm that the book should be removed now";
    setLocalErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    const result = await adminFetch("POST", `/api/admin/books/${bookId}/takedown`, { json: payload });
    setBusy(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    setDone("Takedown recorded. The book is unpublished and its licence is now removed.");
    setValues(emptyRemovalValues());
    setConfirmed(false);
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
      <FormAlert failure={failure} success={done} />
      <SelectField label="Book" value={bookId} error={errors["book"]} onChange={(e) => { setBookId(e.target.value); }}>
        <option value="">Choose a book</option>
        {books.map((book) => (
          <option key={book.id} value={book.id}>{book.title}</option>
        ))}
      </SelectField>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Claimant name" value={values.claimantName} error={errors["claimantName"]} onChange={(e) => { set("claimantName", e.target.value); }} />
        <Input label="Claimant email" type="email" value={values.claimantEmail} error={errors["claimantEmail"]} onChange={(e) => { set("claimantEmail", e.target.value); }} />
        <Input label="Organisation" hint="Optional" value={values.organisation} error={errors["organisation"]} onChange={(e) => { set("organisation", e.target.value); }} />
        <Input label="Relationship to the work" value={values.relationship} error={errors["relationship"]} onChange={(e) => { set("relationship", e.target.value); }} />
      </div>
      <TextAreaField label="What the claimant reported" value={values.description} error={errors["description"]} onChange={(e) => { set("description", e.target.value); }} />
      <TextAreaField label="Reason for removal" rows={2} hint="Kept with the licence record and the audit log." value={values.reason} error={errors["reason"]} onChange={(e) => { set("reason", e.target.value); }} />
      <CheckboxField label="Remove this book now" hint="Sets the licence to removed (no reading, no download) and unpublishes the book." checked={confirmed} onChange={setConfirmed} />
      {errors["confirm"] ? <p className="text-sm font-medium text-danger">{errors["confirm"]}</p> : null}
      <div>
        <Button type="submit" variant="danger" disabled={busy}>{busy ? "Removing" : "Record takedown and remove"}</Button>
      </div>
    </form>
  );
}

function RequestRow({ request, books }: { request: TakedownDto; books: readonly BookOptionDto[] }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [bookId, setBookId] = useState(request.bookId ?? "");
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const unresolved = request.status === "open" || request.status === "under_review";
  const noteOk = note.trim().length >= 3;

  async function act(kind: "removed" | "under_review" | "rejected" | "withdrawn"): Promise<void> {
    setBusy(kind);
    setFailure(null);
    setDone(null);
    const result =
      kind === "removed"
        ? await adminFetch("POST", `/api/admin/books/${bookId}/takedown`, { json: { reason: note.trim(), takedownRequestId: request.id } })
        : await adminFetch("PATCH", `/api/admin/takedowns/${request.id}`, { json: { status: kind, note: note.trim() } });
    setBusy(null);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    setDone(kind === "removed" ? "Book removed and request upheld." : "Request updated.");
    setNote("");
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-ink">
          {request.bookId ? <Link href={`/admin/books/${request.bookId}`}>{request.bookTitle ?? "Book"}</Link> : "No book linked"}
        </p>
        <TakedownBadge status={request.status} />
      </div>
      <p className="text-sm text-ink-muted">
        {request.claimantName} ({request.claimantEmail}), <time dateTime={request.createdAt}>{request.createdAt.slice(0, 10)}</time>
      </p>
      <p className="whitespace-pre-wrap text-sm text-ink">{request.description}</p>
      {request.resolutionNote ? <p className="text-sm text-ink-muted">Resolution: {request.resolutionNote}</p> : null}
      {unresolved ? (
        <div className="flex flex-col gap-3 rounded-md bg-surface-sunken p-3">
          <FormAlert failure={failure} success={done} />
          {request.bookId === null ? (
            <SelectField label="Book to remove" value={bookId} onChange={(e) => { setBookId(e.target.value); }}>
              <option value="">Choose a book</option>
              {books.map((book) => (
                <option key={book.id} value={book.id}>{book.title}</option>
              ))}
            </SelectField>
          ) : null}
          <TextAreaField label="Note for the record" rows={2} hint="Required (3 or more characters)." value={note} onChange={(e) => { setNote(e.target.value); }} />
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" disabled={busy !== null || !noteOk || bookId === ""} onClick={() => void act("removed")}>{busy === "removed" ? "Removing" : "Mark removed"}</Button>
            {request.status === "open" ? <Button variant="secondary" size="sm" disabled={busy !== null || !noteOk} onClick={() => void act("under_review")}>Under review</Button> : null}
            <Button variant="secondary" size="sm" disabled={busy !== null || !noteOk} onClick={() => void act("rejected")}>Reject request</Button>
            <Button variant="secondary" size="sm" disabled={busy !== null || !noteOk} onClick={() => void act("withdrawn")}>Withdrawn</Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function TakedownManager({ requests, books, initialBookId }: { requests: readonly TakedownDto[]; books: readonly BookOptionDto[]; initialBookId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <FormSection id="record" title="Record a takedown and remove a book" description="For complaints received outside the public form. Access ends immediately; files are kept as evidence.">
        <RemovalForm books={books} initialBookId={initialBookId} />
      </FormSection>
      <section aria-labelledby="requests-heading" className="flex flex-col gap-3">
        <h2 id="requests-heading" className="text-xl">Requests</h2>
        {requests.length === 0 ? (
          <EmptyState title="No takedown requests" description="Requests from the public takedown form and recorded removals appear here." />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
            {requests.map((request) => (
              <RequestRow key={request.id} request={request} books={books} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
