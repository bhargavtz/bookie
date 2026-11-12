"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { adminFetch } from "./api";
import { FormAlert } from "./fields";
import type { ApiFailure } from "./forms";

/**
 * Posts to the login route. A rejected sign-in always shows the server's single
 * generic message, so the form never reveals whether the account exists.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    const result = await adminFetch("POST", "/api/admin/login", { json: { email: email.trim(), password } });
    if (result.ok) {
      router.replace("/admin");
      router.refresh();
      return;
    }
    setPassword("");
    setFailure(result.failure);
    setBusy(false);
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
      <FormAlert failure={failure} />
      <Input label="Email" name="email" type="email" autoComplete="username" required value={email} onChange={(event) => { setEmail(event.target.value); }} />
      <Input label="Password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => { setPassword(event.target.value); }} />
      <Button type="submit" disabled={busy || email.trim() === "" || password === ""} fullWidth>
        {busy ? "Signing in" : "Sign in"}
      </Button>
    </form>
  );
}
