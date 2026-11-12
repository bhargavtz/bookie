"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { adminFetch } from "./api";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function signOut(): Promise<void> {
    setBusy(true);
    setProblem(null);
    const result = await adminFetch("POST", "/api/admin/logout");
    // 401 means the session is already gone, which is what the user wanted.
    if (result.ok || result.failure.status === 401) {
      router.replace("/admin/login");
      router.refresh();
      return;
    }
    setProblem(result.failure.message);
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-3">
      {problem ? (
        <span role="alert" className="text-sm font-medium text-danger">
          {problem}
        </span>
      ) : null}
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => void signOut()}>
        {busy ? "Signing out" : "Sign out"}
      </Button>
    </div>
  );
}
