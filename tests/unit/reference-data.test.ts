import { describe, expect, it } from "vitest";
import { isValidSlug, slugify } from "@/lib/slug";
import { REFERENCE_CATEGORIES } from "@/server/db/reference/categories";

describe("reference categories", () => {
  it("has 15 unique, valid slugs and names", () => {
    expect(REFERENCE_CATEGORIES).toHaveLength(15);
    expect(new Set(REFERENCE_CATEGORIES.map((c) => c.slug)).size).toBe(15);
    expect(new Set(REFERENCE_CATEGORIES.map((c) => c.name)).size).toBe(15);
    for (const c of REFERENCE_CATEGORIES) {
      expect(isValidSlug(c.slug)).toBe(true);
      expect(c.name.length).toBeGreaterThan(2);
    }
  });
  it("slugs are stable under slugify of a shortened name", () => {
    expect(slugify("Web Development")).toBe("web-development");
  });
});
