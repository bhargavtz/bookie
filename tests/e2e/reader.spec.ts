import { expect, test, type Page } from "@playwright/test";

/** Reader and file-access journeys on the seeded TEST fixtures. */

async function openReader(page: Page, slug: string): Promise<void> {
  await page.goto(`/read/${slug}`);
  await expect(page.getByLabel("Page number")).toBeVisible({ timeout: 30_000 });
}

test("reader launches from the book page and navigates pages", async ({ page }) => {
  await page.goto("/book/test-book-alpha");
  await page.getByRole("link", { name: "Read online" }).click();
  await expect(page).toHaveURL(/\/read\/test-book-alpha/);
  const pageInput = page.getByLabel("Page number");
  await expect(pageInput).toBeVisible({ timeout: 30_000 });
  await expect(pageInput).toHaveValue("1");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(pageInput).toHaveValue("2");
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(pageInput).toHaveValue("1");
  // Let the scroll-spy from the programmatic scroll settle; a human cannot type within two frames.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
  await pageInput.fill("10");
  await pageInput.press("Enter");
  await expect(pageInput).toHaveValue("10");
});

test("zoom controls change the zoom mode", async ({ page }) => {
  await openReader(page, "test-book-alpha");
  const fitPage = page.getByRole("button", { name: "Fit page" });
  await fitPage.click();
  await expect(fitPage).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(fitPage).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.getByRole("button", { name: "Fit width" }).click();
  await expect(page.getByRole("button", { name: "Fit width" })).toHaveAttribute("aria-pressed", "true");
});

test("search inside the PDF finds a phrase and jumps to its page", async ({ page }) => {
  await openReader(page, "test-book-alpha");
  await page.getByRole("button", { name: "Search in book" }).click();
  await page.getByLabel("Search in this book").fill("lantern-orchard-12");
  await page.getByLabel("Search in this book").press("Enter");
  await expect(page.getByText(/1 match/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tabpanel").getByRole("button").first().click();
  await expect(page.getByLabel("Page number")).toHaveValue("12");
});

test("bookmarks and reading progress persist across a reload", async ({ page }) => {
  await openReader(page, "test-book-alpha");
  const pageInput = page.getByLabel("Page number");
  await pageInput.fill("7");
  await pageInput.press("Enter");
  await expect(pageInput).toHaveValue("7");
  await page.getByRole("button", { name: "Bookmark this page" }).click();
  await expect(page.getByRole("button", { name: "Remove bookmark" })).toBeVisible();
  // Progress is saved after a short debounce.
  await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("bookie:reader:v1") ?? ""), { timeout: 10_000 }).toContain('"page":7');

  await page.reload();
  await expect(page.getByLabel("Page number")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Page number")).toHaveValue("7");
  await expect(page.getByRole("button", { name: "Remove bookmark" })).toBeVisible();
  await page.getByRole("button", { name: "Pages, outline and bookmarks" }).click();
  await page.getByRole("tab", { name: /Bookmarks/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("7");
});

test("an authorised download returns the PDF", async ({ request }) => {
  const response = await request.get("/api/books/test-book-alpha/download");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  expect(response.headers()["content-disposition"]).toContain("attachment");
  expect(response.headers()["cache-control"]).not.toContain("public");
  const body = await response.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
});

test("the inline file route supports byte ranges", async ({ request }) => {
  const response = await request.get("/api/books/test-book-alpha/file", { headers: { Range: "bytes=0-9" } });
  expect(response.status()).toBe(206);
  expect((await response.body()).length).toBe(10);
});

test("restricted and read-only books cannot be downloaded (403)", async ({ request }) => {
  expect((await request.get("/api/books/test-book-restricted/download")).status()).toBe(403);
  expect((await request.get("/api/books/test-book-gamma/download")).status()).toBe(403);
  // Reading the restricted book inline is allowed by its licence.
  expect((await request.get("/api/books/test-book-restricted/file")).status()).toBe(200);
});

test("removed and unknown books are gone or absent", async ({ request }) => {
  expect((await request.get("/api/books/test-book-removed/file")).status()).toBe(410);
  expect((await request.get("/api/books/test-book-removed/download")).status()).toBe(410);
  expect((await request.get("/api/books/no-such-book/file")).status()).toBe(404);
});

test("a book whose PDF is missing from storage fails cleanly", async ({ page, request }) => {
  const file = await request.get("/api/books/test-book-missing-pdf/file");
  expect(file.status()).toBeGreaterThanOrEqual(404);
  expect(file.status()).toBeLessThan(500);
  await page.goto("/read/test-book-missing-pdf");
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Back to the library" }).first()).toBeVisible();
});

test("the reader page of a removed book shows the tombstone", async ({ page }) => {
  await page.goto("/read/test-book-removed");
  await expect(page.getByRole("heading", { name: "This title has been removed" })).toBeVisible();
});
