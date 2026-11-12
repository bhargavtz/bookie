import { searchParamsToObject, shortListQuerySchema } from "@/lib/search/schemas";
import { getCatalogueService, respond } from "@/server/services/catalogue";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return respond(async () => {
    const { limit } = shortListQuerySchema.parse(searchParamsToObject(new URL(request.url).searchParams));
    return { items: (await (await getCatalogueService()).recentlyAdded(limit)).items };
  });
}
