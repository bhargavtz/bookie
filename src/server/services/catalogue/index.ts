import "server-only";
import { getDb } from "@/server/db";
import { createCatalogueService, type CatalogueService } from "./service";

export { CatalogueError } from "./errors";
export { jsonError, jsonOk, respond } from "./http";
export type { CatalogueService } from "./service";

/** Service bound to the process-wide database. Route handlers use this; tests use `createCatalogueService`. */
export async function getCatalogueService(): Promise<CatalogueService> {
  return createCatalogueService({ db: await getDb() });
}
