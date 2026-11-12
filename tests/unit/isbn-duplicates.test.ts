import { describe, expect, it } from "vitest";
import { sha256Hex, sha256HexOfStream, isSha256Hex, looksLikePdf } from "@/lib/checksum";
import { compareForDuplicate, diceCoefficient, normalizeTitle } from "@/lib/duplicates";
import { isValidIsbn10, isValidIsbn13, isbn10To13, normalizeIsbn, toIsbn13 } from "@/lib/isbn";

describe("isbn", () => {
  it("normalises spellings", () => {
    expect(normalizeIsbn("978-0-262-03384-8")).toBe("9780262033848");
    expect(normalizeIsbn(" 0 262 03384 4 ")).toBe("0262033844");
    expect(normalizeIsbn("0-8044-2957-x")).toBe("080442957X");
    expect(normalizeIsbn("abc")).toBeNull();
    expect(normalizeIsbn("12345")).toBeNull();
    expect(normalizeIsbn("X234567890")).toBeNull();
  });

  it("validates ISBN-10 and ISBN-13 check digits", () => {
    expect(isValidIsbn10("0262033844")).toBe(true);
    expect(isValidIsbn10("080442957X")).toBe(true);
    expect(isValidIsbn10("0262033845")).toBe(false);
    expect(isValidIsbn10("026203384")).toBe(false);
    expect(isValidIsbn13("9780262033848")).toBe(true);
    expect(isValidIsbn13("9780262033849")).toBe(false);
    expect(isValidIsbn13("978026203384")).toBe(false);
  });

  it("converts ISBN-10 to ISBN-13", () => {
    expect(isbn10To13("0262033844")).toBe("9780262033848");
    expect(isbn10To13("0262033845")).toBeNull();
  });

  it("toIsbn13 accepts either form", () => {
    expect(toIsbn13("0-262-03384-4")).toBe("9780262033848");
    expect(toIsbn13("978-0-262-03384-8")).toBe("9780262033848");
    expect(toIsbn13("9780262033849")).toBeNull();
    expect(toIsbn13("nope")).toBeNull();
  });
});

describe("checksum", () => {
  it("hashes strings, bytes and streams identically", async () => {
    const expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(sha256Hex("abc")).toBe(expected);
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(expected);
    async function* chunks(): AsyncGenerator<Uint8Array> {
      yield new TextEncoder().encode("a");
      yield new TextEncoder().encode("bc");
    }
    expect(await sha256HexOfStream(chunks())).toBe(expected);
    expect(isSha256Hex(expected)).toBe(true);
    expect(isSha256Hex(expected.toUpperCase())).toBe(false);
    expect(isSha256Hex("abc")).toBe(false);
  });

  it("detects a PDF header", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(looksLikePdf(enc("%PDF-1.7\n..."))).toBe(true);
    expect(looksLikePdf(enc("\n\n  %PDF-1.4"))).toBe(true);
    expect(looksLikePdf(enc("<html>"))).toBe(false);
    expect(looksLikePdf(enc("%PDF"))).toBe(false);
    expect(looksLikePdf(new Uint8Array(0))).toBe(false);
    expect(looksLikePdf(enc(`${"x".repeat(2000)}%PDF-1.4`))).toBe(false);
  });
});

describe("duplicates", () => {
  it("normalises titles", () => {
    expect(normalizeTitle("The C++ Programming Language, 4th Edition")).toBe("cpp programming language");
    expect(normalizeTitle("  Café   Culture!! ")).toBe("cafe culture");
    expect(normalizeTitle("An Introduction to Algorithms (Third Edition)")).toBe("introduction to algorithms third edition".replace(" third edition", ""));
    expect(normalizeTitle("Programming in C#")).toBe("programming in csharp");
  });

  it("dice coefficient", () => {
    expect(diceCoefficient("night", "nacht")).toBeCloseTo(0.25, 5);
    expect(diceCoefficient("same", "same")).toBe(1);
    expect(diceCoefficient("", "")).toBe(0);
    expect(diceCoefficient("a", "ab")).toBe(0);
    expect(diceCoefficient("abc", "xyz")).toBe(0);
  });

  it("matches by sha256, then isbn13, then title; else null", () => {
    const sha = "a".repeat(64);
    expect(compareForDuplicate({ title: "A", sha256: sha }, { title: "B", sha256: sha })).toEqual({ kind: "sha256", score: 1 });
    expect(compareForDuplicate({ title: "Alpha Book", isbn13: "0-262-03384-4" }, { title: "Different", isbn13: "978-0-262-03384-8" })).toEqual({ kind: "isbn13", score: 1 });
    const title = compareForDuplicate({ title: "Introduction to Algorithms" }, { title: "Introduction to Algorithms, 3rd Edition" });
    expect(title?.kind).toBe("title");
    expect(compareForDuplicate({ title: "Compilers" }, { title: "Operating Systems" })).toBeNull();
    expect(compareForDuplicate({ title: "X", isbn13: "bad" }, { title: "Y", isbn13: "bad" })).toBeNull();
    expect(compareForDuplicate({ title: "X", sha256: sha }, { title: "Y", sha256: null })).toBeNull();
  });
});
