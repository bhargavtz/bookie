import { renderSitemapXml } from "@/lib/seo/sitemap";
import { getSitemapService } from "@/server/services/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ page: string }> };

/** Book sitemap pages 2..N, as `/sitemap-books/<n>.xml`. Page 1 lives in /sitemap.xml. */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const match = /^(\d{1,6})\.xml$/.exec((await context.params).page);
  const page = match?.[1] === undefined ? 0 : Number(match[1]);
  if (page < 2) return new Response("Not found", { status: 404 });
  try {
    const entries = await (await getSitemapService()).books(page);
    if (entries.length === 0) return new Response("Not found", { status: 404 });
    return new Response(renderSitemapXml(entries), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" } });
  } catch (error) {
    console.error("sitemap page failed", error instanceof Error ? error.name : "unknown");
    return new Response("Unavailable", { status: 503 });
  }
}
