import { describe, expect, it } from "vitest";
import { COVER_PALETTE_COUNT, coverPaletteFor, hashSeed, type CoverPalette } from "@/components/ui/cover-palette";

describe("hashSeed", () => {
  it("is deterministic and returns an unsigned 32-bit integer", () => {
    expect(hashSeed("Introduction to Algorithms")).toBe(hashSeed("Introduction to Algorithms"));
    const value = hashSeed("anything at all");
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffffffff);
  });

  it("matches the FNV-1a reference value for the empty string", () => {
    expect(hashSeed("")).toBe(0x811c9dc5);
  });
});

describe("coverPaletteFor", () => {
  it("gives the same colourway for the same seed", () => {
    expect(coverPaletteFor("Clean Code")).toEqual(coverPaletteFor("Clean Code"));
  });

  it("only ever returns hex colours", () => {
    const palette = coverPaletteFor("Structure and Interpretation");
    for (const value of Object.values(palette)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("spreads many seeds across the palette set", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      seen.add(coverPaletteFor(`title-${index}`).base);
    }
    expect(seen.size).toBe(COVER_PALETTE_COUNT);
  });

  it("accepts an empty seed and still returns a valid palette", () => {
    const palette: CoverPalette = coverPaletteFor("");
    expect(palette.base).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
