import type { Metadata } from "next";
import { getEnv } from "@/lib/env";
import { buildPageMetadata } from "@/lib/seo";
import { PageHeading, PageShell } from "@/components/home/PageShell";
import { ContactAddress, Prose } from "@/components/home/Prose";
import { Inlines } from "../_content/LegalPage";
import { TAKEDOWN } from "../_content/legal";
import { TakedownForm } from "./TakedownForm";

// Rendered per request: SITE_URL and CONTACT_EMAIL are read at runtime.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildPageMetadata({ title: TAKEDOWN.metaTitle, description: TAKEDOWN.description, path: "/takedown", siteUrl: getEnv().SITE_URL });
}

export default function TakedownPage() {
  const email = getEnv().CONTACT_EMAIL;
  return (
    <PageShell currentPath="/takedown">
      <PageHeading eyebrow={TAKEDOWN.eyebrow} title={TAKEDOWN.title} />
      <Prose>
        <div className="flex flex-col gap-3 text-lg text-ink">
          {TAKEDOWN.intro.map((block, index) => (
            <p key={index}>{block.kind === "p" ? <Inlines parts={block.parts} /> : null}</p>
          ))}
        </div>
        {email === undefined ? (
          <>
            <ContactAddress email={undefined} />
            <p role="status" className="text-base text-ink-muted">{TAKEDOWN.disabled}</p>
          </>
        ) : (
          <>
            <ContactAddress email={email} />
            <TakedownForm messages={{ acknowledgement: TAKEDOWN.acknowledgement, rateLimited: TAKEDOWN.rateLimited, failed: TAKEDOWN.failed }} />
          </>
        )}
      </Prose>
    </PageShell>
  );
}
