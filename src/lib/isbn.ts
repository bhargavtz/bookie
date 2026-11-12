/** ISBN helpers (pure). Duplicate detection compares ISBN-13 only. */

/** Strips hyphens/spaces, upper-cases a trailing x. Returns null if the shape cannot be an ISBN. */
export function normalizeIsbn(raw: string): string | null {
  const s = raw.replace(/[\s-]+/g, "").toUpperCase();
  if (/^\d{13}$/.test(s) || /^\d{9}[\dX]$/.test(s)) return s;
  return null;
}

export function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = isbn.charAt(i);
    const value = ch === "X" ? 10 : Number(ch);
    sum += value * (10 - i);
  }
  return sum % 11 === 0;
}

function isbn13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12.charAt(i)) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function isValidIsbn13(isbn: string): boolean {
  if (!/^\d{13}$/.test(isbn)) return false;
  return isbn13CheckDigit(isbn.slice(0, 12)) === Number(isbn.charAt(12));
}

export function isbn10To13(isbn10: string): string | null {
  if (!isValidIsbn10(isbn10)) return null;
  const first12 = `978${isbn10.slice(0, 9)}`;
  return `${first12}${isbn13CheckDigit(first12)}`;
}

/** Any ISBN spelling in, a valid ISBN-13 (digits only) out, or null. */
export function toIsbn13(raw: string): string | null {
  const n = normalizeIsbn(raw);
  if (n === null) return null;
  if (n.length === 13) return isValidIsbn13(n) ? n : null;
  return isbn10To13(n);
}
