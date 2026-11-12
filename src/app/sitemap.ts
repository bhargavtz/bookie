import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";
import { entry, STATIC_SITEMAP_PATHS } from "@/lib/seo/sitemap";
import { getSitemapService } from "@/server/services/seo";

// Generated per request from the database; `next build` must never open it.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    return await (await getSitemapService()).primary();
  } catch (error) {
    // Name only: database errors can carry connection details. Fall back to the static pages so the file stays valid.
    console.error("sitemap generation failed", error instanceof Error ? error.name : "unknown");
    const siteUrl = getEnv().SITE_URL;
    return STATIC_SITEMAP_PATHS.map((path) => entry(path, siteUrl));
  }
}
