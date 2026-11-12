import type { CSSProperties } from "react";
import { cx } from "./cx";
import { coverPaletteFor, type CoverPalette } from "./cover-palette";
import { PointerTilt } from "./PointerTilt";

export type BookCoverSize = "sm" | "md" | "lg";

export type BookCover3DProps = {
  title: string;
  author?: string;
  /** Picks the colourway. Defaults to the title, so a book keeps its colours. */
  seed?: string;
  size?: BookCoverSize;
  /** Pointer tilt for fine pointers. Touch and reduced motion stay flat. */
  tilt?: boolean;
  className?: string;
};

function coverStyle(palette: CoverPalette): CSSProperties {
  // CSS custom properties are not in CSSProperties' typings, so the keys are
  // added here. Values are fixed palette strings, never user input.
  return {
    "--cover-base": palette.base,
    "--cover-accent": palette.accent,
    "--cover-ink": palette.ink,
    "--cover-spine": palette.spine,
  } as CSSProperties;
}

/**
 * A generated book cover: CSS only, with the title and author supplied as props.
 * Never use real cover art here. The scene is a labelled image for assistive tech,
 * and the visible title and author text is decorative inside it.
 */
export function BookCover3D({
  title,
  author,
  seed,
  size = "md",
  tilt = true,
  className,
}: BookCover3DProps) {
  const palette = coverPaletteFor(seed ?? title);
  const label = author ? `Cover of ${title} by ${author}` : `Cover of ${title}`;

  const face = (
    <div className="bk-cover-book">
      <div className="bk-cover-spine" />
      <div className="bk-cover-face">
        <div className="flex flex-col gap-[calc(var(--cover-w)*0.04)]">
          <div className="bk-cover-band" />
          {author ? <p className="bk-cover-author">{author}</p> : null}
        </div>
        <p className="bk-cover-title">{title}</p>
      </div>
      <div className="bk-cover-pages" />
    </div>
  );

  return (
    <div
      role="img"
      aria-label={label}
      data-size={size}
      style={coverStyle(palette)}
      className={cx("bk-cover-scene", className)}
    >
      {tilt ? (
        <PointerTilt className="bk-cover-tilt">{face}</PointerTilt>
      ) : (
        <div className="bk-cover-tilt">{face}</div>
      )}
      <div className="bk-cover-shadow" />
    </div>
  );
}
