import type { ReactNode } from "react";
import { AdminNav, type AdminNavItem } from "./AdminNav";
import { LogoutButton } from "./LogoutButton";

/** Frame for every signed-in admin page: identity and sign-out on top, section navigation beside the content. */
export function AdminShell({ email, role, nav, children }: { email: string; role: string; nav: readonly AdminNavItem[]; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="text-lg font-semibold text-ink">
            Bookie <span className="font-normal text-ink-muted">admin</span>
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-sm text-ink-muted">
              <span className="sr-only">Signed in as </span>
              {email} <span className="rounded-pill border border-border px-2 py-0.5 text-xs uppercase tracking-wide">{role}</span>
            </p>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-content gap-6 px-4 py-6 sm:px-6 md:grid-cols-[12rem_minmax(0,1fr)]">
        <AdminNav items={nav} />
        <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-col gap-6 focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Page title row used by every admin page. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-3xl text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-prose text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
