import "server-only";
import { getEnv } from "@/lib/env";
import { getDb } from "@/server/db";
import { createSitemapService, type SitemapService } from "./sitemap";

export type { SitemapService } from "./sitemap";

export async function getSitemapService(): Promise<SitemapService> {
  return createSitemapService({ db: await getDb(), siteUrl: getEnv().SITE_URL });
}
