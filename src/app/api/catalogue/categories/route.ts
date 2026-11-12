import { getCatalogueService, respond } from "@/server/services/catalogue";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return respond(async () => (await getCatalogueService()).listCategories());
}
