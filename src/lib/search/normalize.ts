/**
 * Pure text helpers for the search pipeline. Full-text tokenisation destroys
 * the spelling of several technology names ("C++" becomes "c"), so the same
 * normalisation is applied to the indexed text (`buildSearchText`) and to the
 * user's query. Both sides then agree on "cpp", "csharp", "dotnet", ...
 */

const TECH_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|[^a-z0-9])c\+\+/gi, "$1cpp"],
  [/(^|[^a-z0-9])c#/gi, "$1csharp"],
  [/(^|[^a-z0-9])f#/gi, "$1fsharp"],
  [/(^|[^a-z0-9])\.net\b/gi, "$1dotnet"],
  [/\bnode\.js\b/gi, "nodejs"],
  [/\bvue\.js\b/gi, "vuejs"],
  [/\bnext\.js\b/gi, "nextjs"],
];

// Control characters are stripped on purpose: two of them are reserved as highlight markers.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export function normalizeTechTokens(input: string): string {
  let out = input;
  for (const [pattern, replacement] of TECH_REPLACEMENTS) out = out.replace(pattern, replacement);
  return out;
}

/** Collapses whitespace, strips control characters, applies technology normalisation. Empty string when nothing searchable remains. */
export function normalizeSearchText(raw: string): string {
  const cleaned = raw.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  const normalized = normalizeTechTokens(cleaned);
  // A query with no letter or digit (for example "!!!") cannot match anything.
  return /[\p{L}\p{N}]/u.test(normalized) ? normalized : "";
}

/** Escapes LIKE/ILIKE wildcards so user text is matched literally (use with ESCAPE '\\', the PostgreSQL default). */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export type SearchTextParts = {
  authors: readonly string[];
  technologies: readonly { name: string; aliases: readonly string[] }[];
  categories: readonly string[];
  tags: readonly string[];
};

/** Content of `books.search_text`: the text from related tables that the generated tsvector cannot read itself. */
export function buildSearchText(parts: SearchTextParts): string {
  const words: string[] = [];
  words.push(...parts.authors);
  for (const technology of parts.technologies) words.push(technology.name, ...technology.aliases);
  words.push(...parts.categories, ...parts.tags);
  const unique = [...new Set(words.map((w) => w.trim()).filter((w) => w.length > 0))];
  return normalizeTechTokens(unique.join(" "));
}

/** True when the query uses web-search operators (-exclude, "phrase", OR); fuzzy title matching is then skipped so exclusions are honoured. */
export function hasSearchOperators(text: string): boolean {
  return /(^|\s)-\S/.test(text) || text.includes('"') || /\bOR\b/.test(text);
}
