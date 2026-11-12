"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { BookStatus } from "@/contracts/enums";
import { adminFetch } from "./api";
import { FormAlert, TextAreaField } from "./fields";
import type { ApiFailure } from "./forms";
import type { CapabilitiesDto } from "./types";

type ActionName = "submit" | "publish" | "reject" | "unpublish" | "archive" | "delete";

const DONE: Record<ActionName, string> = {
  submit: "Submitted for review.",
  publish: "Published.",
  reject: "Returned to draft.",
  unpublish: "Unpublished.",
  archive: "Archived.",
  delete: "Deleted.",
};

/**
 * Review workflow. Publishing asks the server; if the licence is not approved the server's
 * `publish_blocked` answer is shown with the list of unmet requirements instead of a generic error.
 */
export function PublishPanel({ bookId, status, caps }: { bookId: string; status: BookStatus; caps: CapabilitiesDto }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<ActionName | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"archive" | "delete" | null>(null);

  async function run(action: ActionName): Promise<void> {
    setBusy(action);
    setFailure(null);
    setDone(null);
    const needsReason = action === "reject" || action === "unpublish";
    const result =
      action === "delete"
        ? await adminFetch("DELETE", `/api/admin/books/${bookId}`)
        : await adminFetch("POST", `/api/admin/books/${bookId}/${action}`, needsReason ? { json: { reason: reason.trim() } } : { json: {} });
    setBusy(null);
    setConfirming(null);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    if (action === "delete") {
      router.push("/admin/books");
      return;
    }
    setReason("");
    setDone(DONE[action]);
    router.refresh();
  }

  const canSubmit = caps.write && (status === "draft" || status === "unpublished");
  const canPublish = caps.approve && status !== "published" && status !== "archived";
  const canReject = caps.approve && status === "in_review";
  const canUnpublish = caps.approve && status === "published";
  const needsReason = canReject || canUnpublish;
  const reasonTooShort = reason.trim().length < 3;
  const anything = canSubmit || canPublish || canReject || canUnpublish || (caps.write && status !== "archived") || caps.del;

  if (!anything) return <p className="text-sm text-ink-muted">No publication actions are available for your role at this status.</p>;

  return (
    <div className="flex flex-col gap-4">
      <FormAlert failure={failure} success={done} />
      {needsReason ? (
        <TextAreaField label="Reason" rows={2} hint="Required (3 or more characters) to reject or unpublish. Recorded in the audit log." value={reason} onChange={(e) => { setReason(e.target.value); }} />
      ) : null}
      <div className="flex flex-wrap gap-3">
        {canSubmit ? <Button variant="secondary" disabled={busy !== null} onClick={() => void run("submit")}>{busy === "submit" ? "Submitting" : "Submit for review"}</Button> : null}
        {canPublish ? <Button disabled={busy !== null} onClick={() => void run("publish")}>{busy === "publish" ? "Publishing" : "Approve and publish"}</Button> : null}
        {canReject ? <Button variant="secondary" disabled={busy !== null || reasonTooShort} onClick={() => void run("reject")}>{busy === "reject" ? "Rejecting" : "Reject to draft"}</Button> : null}
        {canUnpublish ? <Button variant="secondary" disabled={busy !== null || reasonTooShort} onClick={() => void run("unpublish")}>{busy === "unpublish" ? "Unpublishing" : "Unpublish"}</Button> : null}
      </div>

      {(caps.write && status !== "archived") || caps.del ? (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <h3 className="text-base font-semibold">Archive or delete</h3>
          {confirming === null ? (
            <div className="flex flex-wrap gap-3">
              {caps.write && status !== "archived" ? <Button variant="secondary" onClick={() => { setConfirming("archive"); }}>Archive</Button> : null}
              {caps.del ? <Button variant="danger" onClick={() => { setConfirming("delete"); }}>Delete</Button> : null}
            </div>
          ) : (
            <div role="group" aria-label="Confirm" className="flex flex-col gap-3 rounded-md border border-danger/40 bg-danger-subtle p-4">
              <p className="text-sm text-ink">
                {confirming === "archive"
                  ? "Archiving hides the book everywhere. It stays in the library records."
                  : "Deleting hides the book everywhere and frees its ISBN. The record is kept for the audit trail and cannot be restored here."}
              </p>
              <div className="flex gap-3">
                <Button variant={confirming === "delete" ? "danger" : "primary"} disabled={busy !== null} onClick={() => void run(confirming)}>
                  {confirming === "archive" ? "Confirm archive" : "Confirm delete"}
                </Button>
                <Button variant="ghost" onClick={() => { setConfirming(null); }}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
