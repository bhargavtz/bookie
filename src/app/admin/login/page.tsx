import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { Card } from "@/components/ui/Card";
import { hasAdminSession } from "../_lib/session";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const state = await hasAdminSession();
  if (state === "disabled") notFound();
  if (state === "signed_in") redirect("/admin");
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12 focus:outline-none">
      <div>
        <h1 className="text-3xl text-ink">Admin sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">For library staff only.</p>
      </div>
      <Card>
        <LoginForm />
      </Card>
    </main>
  );
}
