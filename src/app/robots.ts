import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";
import { buildRobots } from "@/lib/seo";
import { extraBookPagePath } from "@/lib/seo/sitemap";
import { getSitemapService } from "@/server/services/seo";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  let extra: string[] = [];
  try {
    extra = (await (await getSitemapService()).extraPages()).map(extraBookPagePath);
  } catch (error) {
    console.error("robots sitemap list failed", error instanceof Error ? error.name : "unknown");
  }
  return buildRobots(getEnv().SITE_URL, extra);
}
