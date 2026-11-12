/** Site navigation data and the pure active-link rule. Shared by the header and footer. */

export type NavItem = {
  label: string;
  href: string;
};

export type NavGroup = {
  heading: string;
  items: readonly NavItem[];
};

export const primaryNavigation: readonly NavItem[] = [
  { label: "Library", href: "/library" },
  { label: "Categories", href: "/category" },
  { label: "Collections", href: "/collections" },
  { label: "About", href: "/about" },
];

export const footerNavigation: readonly NavGroup[] = [
  {
    heading: "Explore",
    items: [
      { label: "Library", href: "/library" },
      { label: "Categories", href: "/category" },
      { label: "Collections", href: "/collections" },
    ],
  },
  {
    heading: "Company",
    items: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "Legal",
    items: [
      { label: "Copyright", href: "/copyright" },
      { label: "Licensing", href: "/licensing" },
      { label: "Privacy", href: "/privacy" },
      { label: "Takedown requests", href: "/takedown" },
    ],
  },
];

/**
 * True when `currentPath` is the item's page or a page inside it. The root path
 * matches only itself, so "/" does not light up every link.
 */
export function isActivePath(href: string, currentPath: string | undefined): boolean {
  if (currentPath === undefined) {
    return false;
  }
  if (href === "/") {
    return currentPath === "/";
  }
  return currentPath === href || currentPath.startsWith(`${href}/`);
}
