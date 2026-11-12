import type { Metadata } from "next";
import { getEnv } from "@/lib/env";
import { buildPageMetadata } from "@/lib/seo";
import { COPYRIGHT } from "../_content/legal";
import { LegalPage } from "../_content/LegalPage";

// Rendered per request so the canonical URL (SITE_URL) and contact address (CONTACT_EMAIL) are read at runtime, not baked in at build time.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildPageMetadata({ title: COPYRIGHT.metaTitle, description: COPYRIGHT.description, path: "/copyright", siteUrl: getEnv().SITE_URL });
}

export default function Page() {
  return <LegalPage document={COPYRIGHT} path="/copyright" email={getEnv().CONTACT_EMAIL} />;
}
