import { describe, expect, it } from "vitest";
import { decodeCursor } from "@/lib/search/cursor";
import { BOOKMARKS_KEY, readBookmarks, toggleBookmark, writeBookmarks } from "@/components/books/bookmarks";
import {
  buildQuery,
  cursorForPage,
  authorFilterSlug,
  pageFromParam,
  pagerItems,
  totalPages,
  flattenSearchParams,
} from "@/components/books/links";
import { LEARNING_PATHS, resolveLearningPaths } from "@/components/home/learning-paths";

describe("buildQuery", () => {
  it.each([
    [{}, ""],
    [{ q: "python" }, "?q=python"],
    [{ q: "a b", page: undefined, sort: "" }, "?q=a+b"],
    [{ year: 2020, q: "x" }, "?year=2020&q=x"],
  ])("%j -> %s", (input, expected) => {
    expect(buildQuery(input)).toBe(expected);
  });
});

describe("paging", () => {
  it.each([
    [undefined, 1],
    ["0", 1],
    ["-2", 1],
    ["2.5", 1],
    ["abc", 1],
    ["3", 3],
    ["501", 1],
  ])("pageFromParam(%s) = %d", (input, expected) => {
    expect(pageFromParam(input)).toBe(expected);
  });

  it("cursorForPage encodes the row offset and page 1 has none", () => {
    expect(cursorForPage(1, 24)).toBeUndefined();
    const cursor = cursorForPage(3, 24);
    expect(cursor === undefined ? null : decodeCursor(cursor)).toBe(48);
  });

  it("totalPages is at least one", () => {
    expect(totalPages(0, 12)).toBe(1);
    expect(totalPages(25, 12)).toBe(3);
  });

  it.each([
    [1, 1, [1]],
    [1, 5, [1, 2, null, 5]],
    [3, 5, [1, 2, 3, 4, 5]],
    [5, 10, [1, null, 4, 5, 6, null, 10]],
  ])("pagerItems(%d of %d)", (current, last, expected) => {
    expect(pagerItems(current, last)).toEqual(expected);
  });
});

describe("params", () => {
  it("takes the first value of repeated params and drops undefined", () => {
    expect(flattenSearchParams({ a: ["1", "2"], b: undefined, c: "3" })).toEqual({ a: "1", c: "3" });
  });
  it("turns an author name into a slug", () => {
    expect(authorFilterSlug("Ada Lovelace")).toBe("ada-lovelace");
  });
});

describe("book bookmarks", () => {
  it("toggles, newest first", () => {
    expect(toggleBookmark(["a"], "b")).toEqual(["b", "a"]);
    expect(toggleBookmark(["b", "a"], "b")).toEqual(["a"]);
  });

  it("reads defensively", () => {
    const store = (value: string | null) => ({ getItem: () => value });
    expect(readBookmarks(null)).toEqual([]);
    expect(readBookmarks(store(null))).toEqual([]);
    expect(readBookmarks(store("not json"))).toEqual([]);
    expect(readBookmarks(store('{"a":1}'))).toEqual([]);
    expect(readBookmarks(store('["Bad Slug"]'))).toEqual([]);
    expect(readBookmarks(store('["good-slug"]'))).toEqual(["good-slug"]);
    expect(readBookmarks({ getItem: () => { throw new Error("blocked"); } })).toEqual([]);
  });

  it("reports a failed write", () => {
    const written: Record<string, string> = {};
    expect(writeBookmarks({ getItem: () => null, setItem: (k, v) => { written[k] = v; } }, ["a"])).toBe(true);
    expect(written[BOOKMARKS_KEY]).toBe('["a"]');
    expect(writeBookmarks({ getItem: () => null, setItem: () => { throw new Error("full"); } }, ["a"])).toBe(false);
    expect(writeBookmarks(null, ["a"])).toBe(false);
  });
});

describe("learning paths", () => {
  it("shows nothing when no category exists", () => {
    expect(resolveLearningPaths(LEARNING_PATHS, [])).toEqual([]);
  });

  it("keeps only steps whose category exists and takes names from data", () => {
    const resolved = resolveLearningPaths(
      [{ id: "p", title: "T", summary: "S", categorySlugs: ["a", "missing", "b"] }],
      [
        { slug: "b", name: "Bee", bookCount: 2 },
        { slug: "a", name: "Ay", bookCount: 0 },
      ],
    );
    expect(resolved).toEqual([
      { id: "p", title: "T", summary: "S", steps: [{ slug: "a", name: "Ay", bookCount: 0 }, { slug: "b", name: "Bee", bookCount: 2 }] },
    ]);
  });
});
