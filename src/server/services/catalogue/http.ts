import { ZodError } from "zod";
import type { ApiErrorBody } from "@/lib/search/types";
import { CatalogueError } from "./errors";

const HEADERS = {
  // Listings must reflect takedowns immediately, so nothing is shared-cacheable.
  "Cache-Control": "private, max-age=0, must-revalidate",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: HEADERS });
}

export function jsonError(status: number, error: ApiErrorBody["error"]): Response {
  const body: ApiErrorBody = { error };
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

/** Runs a handler and maps validation, expected and unexpected failures to typed JSON errors. Internal details are never returned. */
export async function respond(handler: () => Promise<unknown>): Promise<Response> {
  try {
    return jsonOk(await handler());
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(400, {
        code: "invalid_query",
        message: "One or more query parameters are invalid.",
        issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
    }
    if (error instanceof CatalogueError) return jsonError(error.status, { code: error.code, message: error.message });
    console.error("catalogue request failed", error instanceof Error ? error.name : "unknown");
    return jsonError(500, { code: "internal", message: "Something went wrong." });
  }
}
