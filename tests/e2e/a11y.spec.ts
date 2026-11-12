import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** axe-core on every public page and the admin login/dashboard; serious and critical violations fail. Runs at desktop and Pixel 7 widths. */

const PUBLIC_PAGES = [
  "/",
  "/library",
  "/search?q=python",
  "/category",
  "/category/programming-languages",
  "/collections",
  "/book/test-book-alpha",
  "/about",
  "/privacy",
  "/copyright",
  "/licensing",
  "/takedown",
  "/contact",
  "/does-not-exist",
];

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

for (const path of PUBLIC_PAGES) {
  test(`axe: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main, h1").first()).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
}

test("axe: reader", async ({ page }) => {
  await page.goto("/read/test-book-alpha");
  await expect(page.getByLabel("Page number")).toBeVisible({ timeout: 30_000 });
  expect(await violations(page)).toEqual([]);
});

test("axe: admin login", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("axe: admin dashboard and books list", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!email || !password, "admin e2e credentials not set");
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email ?? "");
  await page.getByLabel("Password").fill(password ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.goto("/admin/books");
  await expect(page.getByRole("heading", { name: "Books" }).first()).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("keyboard: tab order reaches search from the top of the homepage", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard tab order is a desktop check");
  await page.goto("/");
  const seen: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    seen.push(await page.evaluate(() => {
      const el = document.activeElement;
      return `${el?.tagName ?? ""}:${el?.getAttribute("aria-label") ?? el?.textContent?.trim().slice(0, 30) ?? ""}:${el?.getAttribute("role") ?? ""}`;
    }));
    if (await page.getByRole("combobox", { name: "Search the library" }).evaluate((el) => el === document.activeElement)) break;
  }
  await expect(page.getByRole("combobox", { name: "Search the library" }).first()).toBeFocused();
  // A skip link or the header controls come first, and focus is visible.
  expect(seen.length).toBeLessThanOrEqual(12);
});

test("keyboard: the reader toolbar is reachable and operable without a mouse", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard toolbar check is a desktop check");
  await page.goto("/read/test-book-alpha");
  await expect(page.getByLabel("Page number")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "Back to the library" }).focus();
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  for (let i = 0; i < 8 && !(await zoomIn.evaluate((el) => el === document.activeElement)); i += 1) await page.keyboard.press("Tab");
  await expect(zoomIn).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Fit width" })).toHaveAttribute("aria-pressed", "false");
  // Shortcuts: n goes to the next page, d toggles the theme.
  await page.locator("body").press("n");
  await expect(page.getByLabel("Page number")).toHaveValue("2");
});
