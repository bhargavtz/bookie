import type { Metadata } from "next";
import { getEnv } from "@/lib/env";
import { buildPageMetadata } from "@/lib/seo";
import { PRIVACY } from "../_content/legal";
import { LegalPage } from "../_content/LegalPage";

// Rendered per request so the canonical URL (SITE_URL) and contact address (CONTACT_EMAIL) are read at runtime, not baked in at build time.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildPageMetadata({ title: PRIVACY.metaTitle, description: PRIVACY.description, path: "/privacy", siteUrl: getEnv().SITE_URL });
}

export default function Page() {
  return <LegalPage document={PRIVACY} path="/privacy" email={undefined} />;
}
