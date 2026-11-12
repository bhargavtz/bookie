import { describe, expect, it } from "vitest";
import { ifNoneMatchMatches, ifRangeAllowsRange, parseRangeHeader } from "@/server/http/range";

describe("parseRangeHeader", () => {
  it.each([
    ["bytes=0-99", 1000, { kind: "partial", start: 0, end: 99 }],
    ["bytes=100-", 1000, { kind: "partial", start: 100, end: 999 }],
    ["bytes=-100", 1000, { kind: "partial", start: 900, end: 999 }],
    ["bytes=-5000", 1000, { kind: "partial", start: 0, end: 999 }],
    ["bytes=900-5000", 1000, { kind: "partial", start: 900, end: 999 }],
    ["bytes=999-999", 1000, { kind: "partial", start: 999, end: 999 }],
    ["  bytes=0-0 ", 1000, { kind: "partial", start: 0, end: 0 }],
  ])("%s on %i bytes", (header, size, expected) => {
    expect(parseRangeHeader(header, size)).toEqual(expected);
  });

  it.each([
    ["bytes=1000-", 1000],
    ["bytes=1000-1200", 1000],
    ["bytes=-0", 1000],
    ["bytes=0-0", 0],
    ["bytes=-5", 0],
  ])("%s on %i bytes is unsatisfiable", (header, size) => {
    expect(parseRangeHeader(header, size)).toEqual({ kind: "unsatisfiable" });
  });

  it.each([
    [null],
    [""],
    ["bytes=0-1,5-9"],
    ["items=0-5"],
    ["bytes=abc"],
    ["bytes=-"],
    ["bytes=5-2"],
    ["bytes=0-99999999999999999999"],
    ["bytes= 0-5"],
  ])("ignores %j and serves the full body", (header) => {
    expect(parseRangeHeader(header, 1000)).toEqual({ kind: "full" });
  });
});

describe("validators", () => {
  it("If-Range applies the range only for the matching strong ETag", () => {
    expect(ifRangeAllowsRange(null, '"a"')).toBe(true);
    expect(ifRangeAllowsRange('"a"', '"a"')).toBe(true);
    expect(ifRangeAllowsRange('"b"', '"a"')).toBe(false);
    expect(ifRangeAllowsRange('W/"a"', '"a"')).toBe(false);
    expect(ifRangeAllowsRange("Wed, 21 Oct 2015 07:28:00 GMT", '"a"')).toBe(false);
  });

  it("If-None-Match uses weak comparison, lists and *", () => {
    expect(ifNoneMatchMatches(null, '"a"')).toBe(false);
    expect(ifNoneMatchMatches('"a"', '"a"')).toBe(true);
    expect(ifNoneMatchMatches('W/"a"', '"a"')).toBe(true);
    expect(ifNoneMatchMatches('"x", "a"', '"a"')).toBe(true);
    expect(ifNoneMatchMatches("*", '"a"')).toBe(true);
    expect(ifNoneMatchMatches('"x"', '"a"')).toBe(false);
  });
});
