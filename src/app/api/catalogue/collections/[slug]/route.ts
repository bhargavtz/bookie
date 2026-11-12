import { collectionBooksQuerySchema, searchParamsToObject } from "@/lib/search/schemas";
import { getCatalogueService, respond } from "@/server/services/catalogue";

export const dynamic = "force-dynamic";

export function GET(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  return respond(async () => {
    const { slug } = await context.params;
    const paging = collectionBooksQuerySchema.parse(searchParamsToObject(new URL(request.url).searchParams));
    return (await getCatalogueService()).getCollection(slug, paging);
  });
}
