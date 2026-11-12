import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.join(process.cwd(), "src/app/api/admin");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "_lib" ? [] : routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

/** Routes that implement their own session handling (no role-guarded action). */
const SESSION_ROUTES = new Set(["login", "logout", "me"]);

describe("admin route inventory", () => {
  const files = routeFiles(root);

  it("finds the admin routes", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [path.relative(root, path.dirname(f)), f]))("%s is guarded", (name, file) => {
    const source = readFileSync(file as string, "utf8");
    if (SESSION_ROUTES.has(name as string)) {
      expect(source).toMatch(/assertSameOrigin|requireAdminSession/);
      return;
    }
    // Every HTTP method export goes through adminRoute (which calls requireAdmin).
    const exports = [...source.matchAll(/export (?:const|async function|function) (GET|POST|PUT|PATCH|DELETE)\b/g)];
    expect(exports.length).toBeGreaterThan(0);
    for (const match of exports) {
      expect(source).toMatch(new RegExp(`export const ${match[1]} = adminRoute`));
    }
    expect(source).not.toMatch(/@\/server\/db|@\/server\/repositories|drizzle-orm/);
  });
});
