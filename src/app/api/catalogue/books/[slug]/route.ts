import { getCatalogueService, respond } from "@/server/services/catalogue";

export const dynamic = "force-dynamic";

export function GET(_request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  return respond(async () => {
    const { slug } = await context.params;
    return { book: await (await getCatalogueService()).getBook(slug) };
  });
}
