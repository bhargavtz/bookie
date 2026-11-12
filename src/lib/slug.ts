/**
 * Slug helpers. Pure: no I/O. `uniqueSlug` takes the existence check as a
 * callback so repositories supply the DB lookup.
 */

const DEFAULT_MAX_LENGTH = 80;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Programming-language spellings that plain ASCII folding would destroy. */
const TECH_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/c\+\+/gi, "cpp"],
  [/c#/gi, "csharp"],
  [/f#/gi, "fsharp"],
  [/(^|[^a-z0-9])\.net\b/gi, "$1dotnet"],
];

export function slugify(input: string, maxLength: number = DEFAULT_MAX_LENGTH): string {
  let s = input.normalize("NFKD").replace(/\p{M}+/gu, "");
  for (const [re, to] of TECH_REPLACEMENTS) s = s.replace(re, to);
  s = s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length > maxLength) {
    const endsOnBoundary = s.charAt(maxLength) === "-";
    s = s.slice(0, maxLength);
    // Prefer cutting at a word boundary when that does not discard too much.
    const lastDash = s.lastIndexOf("-");
    if (!endsOnBoundary && lastDash >= Math.floor(maxLength / 2)) s = s.slice(0, lastDash);
    s = s.replace(/-+$/g, "");
  }
  return s.length > 0 ? s : "untitled";
}

export function isValidSlug(value: string, maxLength: number = DEFAULT_MAX_LENGTH + 8): boolean {
  return value.length > 0 && value.length <= maxLength && SLUG_RE.test(value);
}

/** `base`, `base-2`, `base-3`, ... Used by uniqueSlug; exported for tests. */
export function slugCandidate(base: string, attempt: number): string {
  return attempt <= 1 ? base : `${base}-${attempt}`;
}

const MAX_ATTEMPTS = 1000;

/**
 * Returns the first slug derived from `title` for which `isTaken` is false.
 * Race safety is the caller's job: the unique index is the final arbiter and
 * callers must retry on a unique violation.
 */
export async function uniqueSlug(
  title: string,
  isTaken: (slug: string) => boolean | Promise<boolean>,
  maxLength: number = DEFAULT_MAX_LENGTH,
): Promise<string> {
  const base = slugify(title, maxLength);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const candidate = slugCandidate(base, attempt);
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error(`uniqueSlug: no free slug for base "${base}" after ${MAX_ATTEMPTS} attempts`);
}
