import Link from "next/link";
import type { SearchHit } from "@/lib/search/types";
import { hasMatch } from "@/lib/search/highlight";
import { Badge } from "@/components/ui/Badge";
import { BookCover3D } from "@/components/ui/BookCover3D";
import { HighlightedText } from "./HighlightedText";
import { LEVEL_LABELS, bookHref } from "./links";

/**
 * One book in a grid. Title, authors, level and year come from the database;
 * the cover is generated. "Read online" appears only when the rights policy
 * allows reading for the public.
 */
export function BookCard({ book, categoryNames }: { book: SearchHit; categoryNames: Readonly<Record<string, string>> }) {
  const primaryCategory = book.categorySlugs[0];
  const categoryName = primaryCategory === undefined ? undefined : categoryNames[primaryCategory];
  const excerpt = book.highlight !== null && hasMatch(book.highlight.excerpt) ? book.highlight.excerpt : undefined;
  const authorLine = book.authors.join(", ");

  return (
    <article className="relative flex gap-4 rounded-lg border border-border bg-surface-raised p-4 shadow-sm transition-[box-shadow,border-color] duration-[var(--duration-base)] hover:border-border-strong hover:shadow-md sm:flex-col sm:items-start">
      <BookCover3D title={book.title} {...(authorLine === "" ? {} : { author: authorLine })} size="sm" tilt={false} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="text-xl leading-snug">
          <Link href={bookHref(book.slug)} className="text-ink no-underline after:absolute after:inset-0 hover:underline">
            <HighlightedText segments={book.highlight?.title} fallback={book.title} />
          </Link>
        </h3>
        {authorLine !== "" ? <p className="text-sm text-ink-muted">{authorLine}</p> : null}
        {excerpt ? (
          <p className="text-sm text-ink-muted">
            <HighlightedText segments={excerpt} fallback="" />
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {categoryName ? <Badge>{categoryName}</Badge> : null}
          {book.level ? <Badge tone="accent">{LEVEL_LABELS[book.level] ?? book.level}</Badge> : null}
          {book.publishedYear !== null ? <Badge>{book.publishedYear}</Badge> : null}
          {book.canRead ? <Badge tone="success">Read online</Badge> : null}
        </div>
      </div>
    </article>
  );
}

export function BookGrid({ books, categoryNames }: { books: readonly SearchHit[]; categoryNames: Readonly<Record<string, string>> }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {books.map((book) => (
        <li key={book.slug} className="flex">
          <div className="flex w-full">
            <BookCard book={book} categoryNames={categoryNames} />
          </div>
        </li>
      ))}
    </ul>
  );
}
