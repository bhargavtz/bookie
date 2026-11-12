import type { AssetStatus, BookLevel, BookStatus, LicenseType, RightsStatus } from "@/contracts/enums";

/** A book row joined with everything the service needs to apply the rights policy and build DTOs. */
export type BookRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  language: string;
  isbn13: string | null;
  edition: string | null;
  publisher: string | null;
  publishedYear: number | null;
  pageCount: number | null;
  level: BookLevel | null;
  status: BookStatus;
  deletedAt: Date | null;
  license: {
    rightsStatus: RightsStatus;
    allowRead: boolean;
    allowDownload: boolean;
    expiresAt: Date | null;
    licenseType: LicenseType | null;
    rightsHolder: string | null;
    attributionText: string | null;
    licenseUrl: string | null;
    sourceUrl: string | null;
  } | null;
  primaryAssetStatus: AssetStatus | null;
  coverAssetStatus: AssetStatus | null;
  authors: string[];
  categorySlugs: string[];
  technologies: { slug: string; name: string }[];
  /** Match markers (see lib/search/highlight); null unless a text query was given. */
  titleHeadline: string | null;
  descriptionHeadline: string | null;
};

export type RepoSort = "relevance" | "newest" | "title" | "popularity" | "collection";
