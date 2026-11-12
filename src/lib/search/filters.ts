import { isValidSlug } from "@/lib/slug";

/** Filters as they reach the repository: canonical, deduplicated, free of blanks. */
export type CatalogueFilters = {
  categories: string[];
  technologies: string[];
  /** A topic matches a category OR a technology with that slug. */
  topics: string[];
  authors: string[];
  level?: "beginner" | "intermediate" | "advanced";
  language?: string;
  year?: number;
  format?: "pdf";
  license?: string;
};

export type RawFilters = {
  category?: string | undefined;
  technology?: string | undefined;
  topic?: string | undefined;
  author?: string | undefined;
  level?: CatalogueFilters["level"] | undefined;
  language?: string | undefined;
  year?: number | undefined;
  format?: "pdf" | undefined;
  license?: string | undefined;
};

/** Lowercase, URL-decode once, validate. Null for anything that is not a well-formed slug (callers answer 404, never query). */
export function parseSlugParam(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const slug = decoded.trim().toLowerCase();
  return isValidSlug(slug) ? slug : null;
}

const slugList = (value: string | undefined): string[] => {
  if (value === undefined) return [];
  const slug = parseSlugParam(value);
  return slug === null ? [] : [slug];
};

export function normalizeFilters(raw: RawFilters): CatalogueFilters {
  const filters: CatalogueFilters = {
    categories: slugList(raw.category),
    technologies: slugList(raw.technology),
    topics: slugList(raw.topic),
    authors: slugList(raw.author),
  };
  if (raw.level !== undefined) filters.level = raw.level;
  if (raw.language !== undefined) filters.language = raw.language.toLowerCase();
  if (raw.year !== undefined) filters.year = raw.year;
  if (raw.format !== undefined) filters.format = raw.format;
  if (raw.license !== undefined) filters.license = raw.license;
  return filters;
}

export function hasActiveFilters(filters: CatalogueFilters): boolean {
  return (
    filters.categories.length > 0 ||
    filters.technologies.length > 0 ||
    filters.topics.length > 0 ||
    filters.authors.length > 0 ||
    filters.level !== undefined ||
    filters.language !== undefined ||
    filters.year !== undefined ||
    filters.format !== undefined ||
    filters.license !== undefined
  );
}
