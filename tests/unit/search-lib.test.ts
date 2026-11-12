import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "@/lib/search/cursor";
import { hasActiveFilters, normalizeFilters, parseSlugParam } from "@/lib/search/filters";
import { HIGHLIGHT_START, HIGHLIGHT_STOP, hasMatch, parseHighlight } from "@/lib/search/highlight";
import { buildSearchText, escapeLike, hasSearchOperators, normalizeSearchText, normalizeTechTokens } from "@/lib/search/normalize";
import {
  autocompleteQuerySchema,
  catalogueListQuerySchema,
  publicSearchQuerySchema,
  searchParamsToObject,
} from "@/lib/search/schemas";
import { autocompleteTerm } from "@/lib/search/use-autocomplete";

describe("normalizeTechTokens", () => {
  it.each([
    ["C++ Primer", "cpp Primer"],
    ["learn c# fast", "learn csharp fast"],
    ["F# for fun", "fsharp for fun"],
    [".NET core", "dotnet core"],
    ["ASP.NET", "ASP.NET"],
    ["Node.js patterns", "nodejs patterns"],
    ["abc++ is not c", "abc++ is not c"],
    ["plain words", "plain words"],
  ])("%j -> %j", (input, expected) => expect(normalizeTechTokens(input)).toBe(expected));
});

describe("normalizeSearchText", () => {
  it("collapses whitespace, strips control characters and applies technology tokens", () => {
    expect(normalizeSearchText("  c++ \t  memory\u0001 ")).toBe("cpp memory");
  });
  it.each(["", "   ", "!!!", "--- ???"])("returns empty for unsearchable input %j", (input) => {
    expect(normalizeSearchText(input)).toBe("");
  });
  it("keeps non-latin letters", () => expect(normalizeSearchText("日本語 入門")).toBe("日本語 入門"));
});

describe("hasSearchOperators", () => {
  it.each([["rust -book", true], ["-book", true], ['"exact phrase"', true], ["a OR b", true], ["well-known rust", false], ["plain", false]])(
    "%j -> %j",
    (input, expected) => expect(hasSearchOperators(input)).toBe(expected),
  );
});

describe("escapeLike", () => {
  it("escapes wildcards and the escape character", () => expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\"));
});

describe("buildSearchText", () => {
  it("joins unique author, technology (with aliases), category and tag text", () => {
    expect(
      buildSearchText({
        authors: ["Ada Fixture", "Ada Fixture"],
        technologies: [{ name: "C++", aliases: ["cpp", "c++"] }],
        categories: ["Systems"],
        tags: [" performance ", ""],
      }),
    ).toBe("Ada Fixture cpp cpp cpp Systems performance");
  });
  it("is empty when there is nothing to index", () => {
    expect(buildSearchText({ authors: [], technologies: [], categories: [], tags: [] })).toBe("");
  });
});

describe("parseSlugParam (slug handling)", () => {
  it.each([
    ["systems-programming", "systems-programming"],
    ["Systems-Programming", "systems-programming"],
    ["  spaced  ", "spaced"],
    ["caf%C3%A9", null],
    ["a%2Fb", null],
    ["%E0%A4%A", null],
    ["double--hyphen", null],
    ["-leading", null],
    ["", null],
    ["x".repeat(200), null],
    ["../secret", null],
    ["cpp-primer-2", "cpp-primer-2"],
  ])("%j -> %j", (input, expected) => expect(parseSlugParam(input)).toBe(expected));
});

describe("normalizeFilters (category filtering)", () => {
  it("canonicalises slug filters and drops malformed ones", () => {
    expect(normalizeFilters({ category: "Databases", technology: "bad slug", topic: "c-sharp", author: "Ada-Fixture" })).toEqual({
      categories: ["databases"],
      technologies: [],
      topics: ["c-sharp"],
      authors: ["ada-fixture"],
    });
  });
  it("keeps scalar filters and lowercases the language", () => {
    const filters = normalizeFilters({ level: "advanced", language: "PT-br", year: 2020, format: "pdf", license: "cc-by" });
    expect(filters).toMatchObject({ level: "advanced", language: "pt-br", year: 2020, format: "pdf", license: "cc-by" });
  });
  it("reports whether any filter is active", () => {
    expect(hasActiveFilters(normalizeFilters({}))).toBe(false);
    expect(hasActiveFilters(normalizeFilters({ category: "databases" }))).toBe(true);
    expect(hasActiveFilters(normalizeFilters({ category: "not valid!" }))).toBe(false);
    for (const raw of [{ year: 2020 }, { level: "beginner" as const }, { language: "en" }, { format: "pdf" as const }, { license: "cc-by" }, { author: "a" }, { topic: "a" }, { technology: "a" }]) {
      expect(hasActiveFilters(normalizeFilters(raw))).toBe(true);
    }
  });
});

describe("highlight", () => {
  it("splits marked text into segments", () => {
    expect(parseHighlight(`a ${HIGHLIGHT_START}hit${HIGHLIGHT_STOP} b`)).toEqual([
      { text: "a ", match: false },
      { text: "hit", match: true },
      { text: " b", match: false },
    ]);
  });
  it("never interprets markup and handles empty input", () => {
    expect(parseHighlight("<b>x</b>")).toEqual([{ text: "<b>x</b>", match: false }]);
    expect(parseHighlight(null)).toEqual([]);
    expect(parseHighlight("")).toEqual([]);
    expect(hasMatch(parseHighlight(`${HIGHLIGHT_START}x${HIGHLIGHT_STOP}`))).toBe(true);
    expect(hasMatch(parseHighlight("x"))).toBe(false);
  });
});

describe("cursor", () => {
  it("round-trips offsets", () => {
    for (const offset of [0, 12, 10_000]) expect(decodeCursor(encodeCursor(offset))).toBe(offset);
  });
  it.each(["", "%%%", btoa("not json"), btoa("[]"), btoa('{"o":-1}'), btoa('{"o":1.5}'), btoa('{"o":"1"}'), btoa('{"o":10001}')])(
    "rejects %j",
    (cursor) => expect(decodeCursor(cursor)).toBeNull(),
  );
});

describe("query schemas", () => {
  it("applies defaults and treats blanks as absent", () => {
    expect(catalogueListQuerySchema.parse({ category: "", limit: "", sort: "" })).toMatchObject({ sort: "newest", limit: 12 });
    expect(publicSearchQuerySchema.parse({}).sort).toBe("relevance");
  });
  it("coerces numbers and enforces bounds", () => {
    expect(catalogueListQuerySchema.parse({ year: "2020", limit: "48" })).toMatchObject({ year: 2020, limit: 48 });
    for (const bad of [{ limit: "0" }, { limit: "49" }, { year: "1800" }, { year: "abc" }, { sort: "random" }, { category: "Bad Slug" }, { format: "epub" }, { license: "made-up" }, { level: "expert" }]) {
      expect(catalogueListQuerySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
  it("trims and bounds the search text", () => {
    expect(publicSearchQuerySchema.parse({ q: "  rust  " }).q).toBe("rust");
    expect(publicSearchQuerySchema.safeParse({ q: "x".repeat(201) }).success).toBe(false);
    expect(publicSearchQuerySchema.parse({ sort: "popularity" }).sort).toBe("popularity");
  });
  it("requires two characters for autocomplete", () => {
    expect(autocompleteQuerySchema.safeParse({ q: "a" }).success).toBe(false);
    expect(autocompleteQuerySchema.parse({ q: " ab " })).toEqual({ q: "ab", limit: 8 });
    expect(autocompleteQuerySchema.safeParse({ q: "ab", limit: "11" }).success).toBe(false);
  });
  it("converts search params, last value wins", () => {
    expect(searchParamsToObject(new URLSearchParams("a=1&b=2&a=3"))).toEqual({ a: "3", b: "2" });
  });
});

describe("autocompleteTerm", () => {
  it.each([["", null], [" a ", null], ["ab", "ab"], ["  react  ", "react"]])("%j -> %j", (input, expected) => {
    expect(autocompleteTerm(input)).toBe(expected);
  });
});
