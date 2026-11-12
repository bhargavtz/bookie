import { expect, test } from "@playwright/test";

/*
 * Public pages against the seeded TEST fixtures (tests/e2e/fixtures/seed.ts):
 * Test Book Alpha/Beta/Gamma (approved), Restricted, Removed, Missing Pdf.
 */

test("homepage loads with the headline, search and section headings", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "A better place to learn how technology works." })).toBeVisible();
  await expect(page.getByRole("search", { name: "Search the library" })).toBeVisible();
  for (const name of ["Featured books", "Browse by topic", "Most popular", "Recently added", "Curated collections", "Learning paths"]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Privacy" })).toBeVisible();
});

test("the slash shortcut focuses search and 'python' finds the test books", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("/");
  const input = page.getByRole("combobox", { name: "Search the library" });
  await expect(input).toBeFocused();
  await input.fill("python");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=python/);
  await expect(page.getByRole("heading", { level: 1, name: /Results for .python./ })).toBeVisible();
  await expect(page.locator('main a[href="/book/test-book-alpha"]').first()).toBeVisible();
  // Hidden or removed titles never appear in public search.
  await expect(page.locator('main a[href="/book/test-book-removed"]')).toHaveCount(0);
});

test("a category page opens from the category index and lists its books", async ({ page }) => {
  await page.goto("/category");
  await page.getByRole("main").getByRole("link", { name: /Programming Languages/ }).first().click();
  await expect(page).toHaveURL(/\/category\/programming-languages/);
  await expect(page.getByRole("heading", { level: 1, name: "Programming Languages" })).toBeVisible();
  await expect(page.locator('main a[href="/book/test-book-alpha"]').first()).toBeVisible();
  await expect(page.locator('main a[href="/book/test-book-gamma"]')).toHaveCount(0);
});

test("library filters narrow the result list through the URL", async ({ page }) => {
  await page.goto("/library?topic=web-development");
  await expect(page.locator('main a[href="/book/test-book-gamma"]').first()).toBeVisible();
  await expect(page.locator('main a[href="/book/test-book-alpha"]')).toHaveCount(0);

  await page.goto("/library");
  await page.getByText("Filters and sorting").click();
  await page.getByLabel("Topic").selectOption("databases");
  await page.getByRole("button", { name: /apply|filter|update/i }).first().click();
  await expect(page).toHaveURL(/topic=databases/);
  await expect(page.locator('main a[href="/book/test-book-restricted"]').first()).toBeVisible();
  await expect(page.locator('main a[href="/book/test-book-alpha"]')).toHaveCount(0);
});

test("a book detail page shows its metadata and actions", async ({ page }) => {
  await page.goto("/book/test-book-alpha");
  await expect(page.getByRole("heading", { level: 1, name: "Test Book Alpha" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Details" })).toBeVisible();
  await expect(page.getByText("Test Author").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Read online" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Bookmark/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
});

test("a read-only book offers no download link", async ({ page }) => {
  await page.goto("/book/test-book-gamma");
  await expect(page.getByRole("link", { name: "Read online" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download PDF" })).toHaveCount(0);
});

test("an unknown or removed book is a 404 page that reveals no title", async ({ page }) => {
  const response = await page.goto("/book/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
  // NOTE: the wiki says removed = 410 tombstone; the book page maps "gone" to 404 on purpose (see (public)/_lib/data.ts). File routes return 410.
  const removed = await page.goto("/book/test-book-removed");
  expect(removed?.status()).toBe(404);
  await expect(page.getByText("Test Book Removed")).toHaveCount(0);
});

test("legal pages, sitemap and robots respond", async ({ request }) => {
  for (const path of ["/privacy", "/copyright", "/licensing", "/takedown", "/about", "/contact", "/robots.txt"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
  }
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("test-book-alpha");
  expect(sitemap).not.toContain("test-book-removed");
});
