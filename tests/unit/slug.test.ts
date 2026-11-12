import { describe, expect, it } from "vitest";
import { isValidSlug, slugCandidate, slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it.each([
    ["Introduction to Algorithms", "introduction-to-algorithms"],
    ["  Hello,   World!  ", "hello-world"],
    ["Café Résumé Naïve", "cafe-resume-naive"],
    ["Rock & Roll", "rock-and-roll"],
    ["Don't Panic", "dont-panic"],
    ["C++ Primer", "cpp-primer"],
    ["Programming in C#", "programming-in-csharp"],
    [".NET in Action", "dotnet-in-action"],
    ["ASP.NET Core", "asp-net-core"],
    ["Node.js Design Patterns", "node-js-design-patterns"],
    ["---", "untitled"],
    ["", "untitled"],
    ["日本語", "untitled"],
  ])("%j -> %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("truncates at a word boundary without a trailing hyphen", () => {
    const out = slugify("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda", 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.endsWith("-")).toBe(false);
    expect(out).toBe("alpha-beta-gamma-delta-epsilon");
  });

  it("hard-cuts a single long word", () => {
    expect(slugify("a".repeat(100), 10)).toBe("a".repeat(10));
  });

  it("always produces a valid slug", () => {
    for (const input of ["x", "A--B", "  ", "ünï", "1 2 3", "a".repeat(300)]) {
      expect(isValidSlug(slugify(input))).toBe(true);
    }
  });
});

describe("isValidSlug", () => {
  it.each([
    ["abc", true],
    ["a-b-c", true],
    ["a--b", false],
    ["-a", false],
    ["a-", false],
    ["A", false],
    ["", false],
    ["a b", false],
  ])("%j -> %s", (input, expected) => {
    expect(isValidSlug(input)).toBe(expected);
  });
  it("enforces max length", () => {
    expect(isValidSlug("a".repeat(89))).toBe(false);
    expect(isValidSlug("a".repeat(88))).toBe(true);
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", async () => {
    expect(await uniqueSlug("My Book", () => false)).toBe("my-book");
  });
  it("appends a counter until free (async check)", async () => {
    const taken = new Set(["my-book", "my-book-2", "my-book-3"]);
    expect(await uniqueSlug("My Book", (s) => Promise.resolve(taken.has(s)))).toBe("my-book-4");
  });
  it("gives up after a bounded number of attempts", async () => {
    await expect(uniqueSlug("x", () => true)).rejects.toThrow(/no free slug/);
  });
  it("slugCandidate numbering", () => {
    expect(slugCandidate("a", 1)).toBe("a");
    expect(slugCandidate("a", 2)).toBe("a-2");
  });
});
