import { searchParamsToObject, shortListQuerySchema } from "@/lib/search/schemas";
import { getCatalogueService, respond } from "@/server/services/catalogue";

export const dynamic = "force-dynamic";

/** Ranked by real served-download counts; empty until downloads have happened. */
export function GET(request: Request): Promise<Response> {
  return respond(async () => {
    const { limit } = shortListQuerySchema.parse(searchParamsToObject(new URL(request.url).searchParams));
    return { items: (await (await getCatalogueService()).popular(limit)).items };
  });
}
