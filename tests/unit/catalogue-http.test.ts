import { describe, expect, it, vi } from "vitest";
import { catalogueListQuerySchema } from "@/lib/search/schemas";
import { CatalogueError } from "@/server/services/catalogue/errors";
import { respond } from "@/server/services/catalogue/http";

describe("respond (typed error responses)", () => {
  it("returns 200 JSON with a private cache header", async () => {
    const response = await respond(async () => ({ ok: true }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=0, must-revalidate");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("maps zod failures to 400 invalid_query with issues", async () => {
    const response = await respond(async () => catalogueListQuerySchema.parse({ limit: "999" }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; issues: { path: string }[] } };
    expect(body.error.code).toBe("invalid_query");
    expect(body.error.issues.map((i) => i.path)).toContain("limit");
  });

  it.each([
    ["not_found", 404],
    ["gone", 410],
    ["invalid_query", 400],
  ] as const)("maps CatalogueError %s to %i", async (code, status) => {
    const response = await respond(async () => {
      throw new CatalogueError(code, "message");
    });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code, message: "message" } });
  });

  it("hides the details of unexpected errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await respond(async () => {
      throw new Error("connection string postgres://secret");
    });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(spy).toHaveBeenCalledWith("catalogue request failed", "Error");
    spy.mockRestore();
  });
});
