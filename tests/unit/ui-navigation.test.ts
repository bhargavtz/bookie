import { describe, expect, it } from "vitest";
import { footerNavigation, isActivePath, primaryNavigation } from "@/components/layout/navigation";

describe("isActivePath", () => {
  it.each([
    ["exact match", "/library", "/library", true],
    ["child page is active under its section", "/library", "/library/fiction", true],
    ["prefix of a different section is not active", "/library", "/libraryx", false],
    ["root matches only the root", "/", "/", true],
    ["root does not match other pages", "/", "/library", false],
    ["no current path means nothing is active", "/about", undefined, false],
  ])("%s", (_name, href, currentPath, expected) => {
    expect(isActivePath(href, currentPath)).toBe(expected);
  });
});

describe("navigation data", () => {
  it("keeps the required legal and company links in the footer", () => {
    const hrefs = footerNavigation.flatMap((group) => group.items.map((item) => item.href));
    for (const required of ["/about", "/contact", "/copyright", "/licensing", "/privacy"]) {
      expect(hrefs).toContain(required);
    }
  });

  it("uses root-relative hrefs only", () => {
    const hrefs = [
      ...primaryNavigation.map((item) => item.href),
      ...footerNavigation.flatMap((group) => group.items.map((item) => item.href)),
    ];
    for (const href of hrefs) {
      expect(href.startsWith("/")).toBe(true);
      expect(href).not.toMatch(/^\/\//);
    }
  });
});
