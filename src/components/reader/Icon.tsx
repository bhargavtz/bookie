const PATHS = {
  back: "M15 5l-7 7 7 7",
  prev: "M18 15l-6-6-6 6",
  next: "M6 9l6 6 6-6",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5",
  panel: "M4 5h16v14H4zM9 5v14",
  bookmark: "M7 4h10v16l-5-4-5 4z",
  moon: "M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z",
  sun: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  fitWidth: "M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4",
  fitPage: "M7 3h10v18H7zM3 8h2M19 8h2M3 16h2M19 16h2",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  close: "M6 6l12 12M18 6L6 18",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
