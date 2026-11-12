import { autocompleteQuerySchema, searchParamsToObject } from "@/lib/search/schemas";
import { respond } from "@/server/services/catalogue";
import { getSearchService } from "@/server/services/search";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return respond(async () => {
    const query = autocompleteQuerySchema.parse(searchParamsToObject(new URL(request.url).searchParams));
    return { suggestions: await (await getSearchService()).autocomplete(query) };
  });
}
