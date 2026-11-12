import type { BookSummary } from "@/contracts/catalogue";
import type { HighlightSegment } from "./highlight";

export type SearchHit = BookSummary & {
  /** Present only for text searches. */
  highlight: { title: HighlightSegment[]; excerpt: HighlightSegment[] } | null;
};

export type CategoryWithCount = {
  slug: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  /** Unique listable books in this category. */
  bookCount: number;
};

export type CategoryList = {
  categories: CategoryWithCount[];
  /** Unique listable books overall. Not the sum of the category counts: a multi-category book is one book. */
  totalBooks: number;
};

export type CollectionSummary = {
  slug: string;
  title: string;
  description: string | null;
  isFeatured: boolean;
  bookCount: number;
};

export type Suggestion = {
  type: "book" | "author" | "category" | "technology";
  label: string;
  slug: string;
};

export type ApiErrorCode = "invalid_query" | "not_found" | "gone" | "internal";

/** Body of every non-2xx response from the catalogue and search APIs. */
export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    issues?: { path: string; message: string }[];
  };
};
