import { expect, test } from "@playwright/test";

/** Mobile viewport smoke (Pixel 7): no horizontal scroll, search and reader usable. */

test("homepage, search and book page fit a phone viewport", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.goto("/search?q=python");
  await expect(page.locator('main a[href="/book/test-book-alpha"]').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await page.goto("/book/test-book-alpha");
  await expect(page.getByRole("link", { name: "Read online" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("the reader opens on a phone and pages can be turned", async ({ page }) => {
  await page.goto("/read/test-book-alpha");
  const pageInput = page.getByLabel("Page number");
  await expect(pageInput).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(pageInput).toHaveValue("2");
  await page.getByRole("button", { name: "Reader tools" }).click();
  await expect(page.getByRole("button", { name: "Search in book" })).toBeVisible();
});
