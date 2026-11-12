import { describe, expect, it } from "vitest";
import { CsvParseError, parseCsv, validateCsvRecords } from "@/lib/csv";

const header = "title,authors,isbn,published_year,page_count,level,categories,technologies,tags,source_url";

describe("parseCsv", () => {
  it("parses quoted fields, doubled quotes, embedded newlines, CRLF and a BOM", () => {
    const text = `\uFEFFTitle,Authors,Description\r\n"Quoted, title",Ada Test,"line one\nline ""two"""\r\nPlain,Bob Test,\r\n`;
    const { columns, records } = parseCsv(text);
    expect(columns).toEqual(["title", "authors", "description"]);
    expect(records).toHaveLength(2);
    expect(records[0]?.values["title"]).toBe("Quoted, title");
    expect(records[0]?.values["description"]).toBe('line one\nline "two"');
    expect(records[1]).toMatchObject({ line: 4, values: { title: "Plain", description: "" } });
  });

  it("normalises header names and skips blank lines", () => {
    const { columns, records } = parseCsv("Published Year,Title\n\n2020,A\n");
    expect(columns).toEqual(["published_year", "title"]);
    expect(records).toHaveLength(1);
  });

  it.each([
    ["unterminated quote", 'title,authors\n"oops,Ada'],
    ["stray quote", "title,authors\nab\"c,Ada"],
    ["text after a closing quote", 'title,authors\n"a"b,Ada'],
    ["too many fields", "title,authors\na,b,c"],
    ["duplicate headers", "title,title\na,b"],
    ["empty header name", "title,\na,b"],
    ["empty file", ""],
  ])("rejects %s", (_name, text) => {
    expect(() => parseCsv(text)).toThrow(CsvParseError);
  });

  it("enforces size, row and column limits", () => {
    expect(() => parseCsv("a,b\n1,2", { maxBytes: 3, maxRows: 10, maxColumns: 10 })).toThrow(/larger/);
    expect(() => parseCsv("a\n1\n2\n3", { maxBytes: 100, maxRows: 2, maxColumns: 10 })).toThrow(/data rows/);
    expect(() => parseCsv("a,b,c\n1,2,3", { maxBytes: 100, maxRows: 10, maxColumns: 2 })).toThrow(/columns/);
  });
});

describe("validateCsvRecords", () => {
  const run = (...rows: string[]) => validateCsvRecords(parseCsv([header, ...rows].join("\n")).records);

  it("accepts a valid row and converts ISBN-10, lists and numbers", () => {
    const [row] = run("Test Driven Things,Ada Test; Bob Test,0-306-40615-2,2020,350,Beginner,algorithms;web,rust,tag one;tag two,https://example.org/evidence");
    expect(row?.ok).toBe(true);
    if (row?.ok) {
      expect(row.row.metadata).toMatchObject({
        title: "Test Driven Things",
        authors: ["Ada Test", "Bob Test"],
        isbn13: "9780306406157",
        publishedYear: 2020,
        pageCount: 350,
        level: "beginner",
        categories: ["algorithms", "web"],
        technologies: ["rust"],
        tags: ["tag one", "tag two"],
      });
      expect(row.row.sourceUrl).toBe("https://example.org/evidence");
    }
  });

  it("reports field-level errors per row with line numbers", () => {
    const results = run(
      ",Ada,,,,,,,,",
      "Fine Title,Ada,not-an-isbn,1500,0,expert,Bad Slug,,,http://127.0.0.1/admin",
    );
    expect(results.every((r) => !r.ok)).toBe(true);
    const [first, second] = results;
    expect(first && !first.ok && first.errors.map((e) => e.field)).toContain("title");
    expect(second?.line).toBe(3);
    const fields = second && !second.ok ? second.errors.map((e) => e.field) : [];
    expect(fields).toEqual(expect.arrayContaining(["isbn13", "publishedYear", "pageCount", "level", "categories.0", "source_url"]));
  });

  it("rejects a private-address source_url without fetching it", () => {
    const [row] = run("T,Ada,,,,,,,,https://169.254.169.254/latest");
    expect(row?.ok).toBe(false);
  });

  it("flags a repeated ISBN within the file as an error and a similar title as a warning", () => {
    const [a, b, c] = run(
      "Alpha Book,Ada,9780306406157,,,,,,,",
      "Beta Book,Ada,9780306406157,,,,,,,",
      "Alpha Book,Ada,,,,,,,,",
    );
    expect(a?.ok).toBe(true);
    expect(b && !b.ok && b.errors[0]?.message).toMatch(/line 2/);
    expect(c?.ok && c.warnings[0]?.message).toMatch(/line 2/);
  });
});
