import { expect, test, type Page } from "@playwright/test";

/**
 * Admin e2e: login failure/success, protected-route redirect, add and edit a book, CSV import.
 *
 * The admin area is disabled (404) unless the server has ADMIN_EMAIL and ADMIN_PASSWORD_HASH.
 * playwright.config.ts loads them, plus E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD, from the gitignored
 * `.env.e2e` (test-only credentials; create with `npm run admin:hash`). Without E2E_ADMIN_EMAIL and
 * E2E_ADMIN_PASSWORD the suite is skipped; no credential lives in this repository.
 */
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;

test.describe("admin", () => {
  test.skip(email === undefined || email === "" || password === undefined || password === "", "set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (and start the server with ADMIN_EMAIL / ADMIN_PASSWORD_HASH)");

  test("a protected page redirects to the login page without a session", async ({ page }) => {
    await page.goto("/admin/books");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
  });

  test("the admin overview redirects to the login page without a session", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("a wrong password shows one generic error and stays on the login page", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(email ?? "");
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Invalid" })).toContainText("Invalid email or password");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("an unknown email gets the same message as a wrong password", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill("nobody-here@example.com");
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Invalid" })).toContainText("Invalid email or password");
  });

  async function signIn(page: Page): Promise<void> {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(email ?? "");
    await page.getByLabel("Password").fill(password ?? "");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  }

  test("add a book as a draft, then edit it", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/books/new");
    await page.getByLabel("Title", { exact: true }).fill("Test Book Created By E2E");
    await page.getByLabel("Authors").fill("Test Author");
    await page.getByLabel("Description", { exact: true }).fill("Test fixture created by the e2e admin spec.");
    await page.getByLabel("Web Development").check();
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page).toHaveURL(/\/admin\/books\/[0-9a-f-]{36}$/);
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Test Book Created By E2E");

    await page.getByLabel("Publisher").fill("Test Publisher");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByText("Details saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Publisher")).toHaveValue("Test Publisher");

    // A new book is a draft with no rights: it must not be public.
    const response = await page.request.get("/api/books/test-book-created-by-e2e/file");
    expect(response.status()).toBe(404);
  });

  test("CSV import: dry run reports row problems, commit creates drafts only", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/import");
    const csv = [
      "title,authors,description,categories",
      "Test Book Imported One,Test Author,Test fixture row,web-development",
      "Test Book Imported Two,Test Author,Test fixture row,databases",
      ",,missing required values,",
    ].join("\n");
    await page.getByLabel("CSV file").setInputFiles({ name: "test-books.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByRole("button", { name: /Check file/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "rows read" })).toContainText("3 rows read");
    await expect(page.getByRole("status").filter({ hasText: "rows read" })).toContainText("2 can be imported");
    await page.getByRole("button", { name: /Import 2 valid rows/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "imported as drafts" })).toContainText("2 of 3 rows imported as drafts");
    await page.goto("/admin/books?q=Imported");
    await expect(page.getByText("Test Book Imported One").first()).toBeVisible();
    // Imported rows are drafts with no rights: absent from the public library.
    await page.goto("/search?q=Imported");
    await expect(page.locator('main a[href^="/book/"]')).toHaveCount(0);
  });

  test("a correct login opens the overview and sign out ends the session", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(email ?? "");
    await page.getByLabel("Password").fill(password ?? "");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin/books");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});
