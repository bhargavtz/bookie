import { toResponse } from "@/server/http/file-response";
import { serveFile } from "@/server/services/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

async function handle(request: Request, context: RouteContext, method: "GET" | "HEAD"): Promise<Response> {
  const { slug } = await context.params;
  const outcome = await serveFile({ slug, mode: "download", method, headers: request.headers, signal: request.signal });
  return toResponse(outcome, method === "HEAD");
}

export function GET(request: Request, context: RouteContext): Promise<Response> {
  return handle(request, context, "GET");
}

export function HEAD(request: Request, context: RouteContext): Promise<Response> {
  return handle(request, context, "HEAD");
}
