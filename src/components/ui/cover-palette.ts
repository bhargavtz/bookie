/**
 * Generated cover colourways. Every cover is drawn in CSS from these values, so
 * no third-party artwork is needed. Each palette keeps its title ink readable on
 * its base colour (all pairs checked above 4.5:1 by hand, 2026-11-11).
 */

export type CoverPalette = {
  base: string;
  accent: string;
  ink: string;
  spine: string;
};

const DEFAULT_PALETTE: CoverPalette = { base: "#1f2d4a", accent: "#e0b35a", ink: "#f7f1e3", spine: "#141d30" };

const PALETTES: readonly CoverPalette[] = [
  DEFAULT_PALETTE,
  { base: "#6b1f24", accent: "#e8c9a0", ink: "#fbf1e6", spine: "#44141a" },
  { base: "#23412f", accent: "#c9d98a", ink: "#f2f5e8", spine: "#152b1e" },
  { base: "#8f4f1d", accent: "#f3d9b1", ink: "#fff6ea", spine: "#5e3212" },
  { base: "#2f3b44", accent: "#8fd3c7", ink: "#eef4f3", spine: "#1d262c" },
  { base: "#4a2d55", accent: "#f0a8c8", ink: "#faf0f6", spine: "#2e1a35" },
  { base: "#e6dccb", accent: "#2650d6", ink: "#1c1b19", spine: "#c9bda4" },
];

/** FNV-1a, 32-bit. Stable across runs and platforms, unlike Math.random. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** The same seed (usually the book title or ID) always gets the same colourway. */
export function coverPaletteFor(seed: string): CoverPalette {
  return PALETTES[hashSeed(seed) % PALETTES.length] ?? DEFAULT_PALETTE;
}

export const COVER_PALETTE_COUNT = PALETTES.length;
