import { publicSearchQuerySchema, searchParamsToObject } from "@/lib/search/schemas";
import { getCatalogueService, respond } from "@/server/services/catalogue";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return respond(async () => {
    const query = publicSearchQuerySchema.parse(searchParamsToObject(new URL(request.url).searchParams));
    return (await getCatalogueService()).searchBooks(query);
  });
}
