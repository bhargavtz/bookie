import "server-only";
import { getDb } from "@/server/db";
import { createSearchService, type SearchService } from "./service";

export type { SearchService } from "./service";

export async function getSearchService(): Promise<SearchService> {
  return createSearchService({ db: await getDb() });
}
