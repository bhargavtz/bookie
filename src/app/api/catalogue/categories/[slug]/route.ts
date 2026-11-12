import { catalogueListQuerySchema, searchParamsToObject } from "@/lib/search/schemas";
import { getCatalogueService, respond } from "@/server/services/catalogue";

export const dynamic = "force-dynamic";

/** A category with its count and one page of its books. The path slug wins over any `category` query parameter. */
export function GET(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  return respond(async () => {
    const { slug } = await context.params;
    const query = catalogueListQuerySchema.parse(searchParamsToObject(new URL(request.url).searchParams));
    const service = await getCatalogueService();
    const category = await service.getCategory(slug);
    const books = await service.listBooks({ ...query, category: category.slug });
    return { category, books };
  });
}
