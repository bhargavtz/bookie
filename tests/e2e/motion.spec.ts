import { expect, test } from "@playwright/test";

/** prefers-reduced-motion: the book-page cover tilt does not move and CSS transitions are disabled. */

test("with reduced motion, pointer movement does not tilt covers", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto("/book/test-book-alpha");
  const tilt = page.locator("[class*='bk-cover-tilt'], .bk-cover-tilt").first();
  await expect(tilt).toBeVisible();
  const box = await tilt.boundingBox();
  if (box === null) throw new Error("no box");
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1);
  await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.05, { steps: 5 });
  const vars = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("*")).filter((e) => e.style.getPropertyValue("--tilt-x") !== "");
    return els.map((e) => [e.style.getPropertyValue("--tilt-x"), e.style.getPropertyValue("--tilt-y")]);
  });
  for (const [x, y] of vars) {
    expect(Number(x)).toBe(0);
    expect(Number(y)).toBe(0);
  }
  const transition = await page.evaluate(() => {
    const book = document.querySelector<HTMLElement>(".bk-cover-book");
    return book === null ? null : getComputedStyle(book).transitionDuration;
  });
  // globals.css collapses durations to 0.01ms under reduced motion.
  if (transition !== null) for (const part of transition.split(",")) expect(Number.parseFloat(part)).toBeLessThanOrEqual(0.001);
  await context.close();
});

test("without reduced motion, pointer movement tilts covers (control)", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "no-preference", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto("/book/test-book-alpha");
  const tilt = page.locator(".bk-cover-tilt").first();
  await expect(tilt).toBeVisible();
  const box = await tilt.boundingBox();
  if (box === null) throw new Error("no box");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1, { steps: 5 });
  const moved = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("*")).some((e) => {
      const x = e.style.getPropertyValue("--tilt-x");
      return x !== "" && Number(x) !== 0;
    }),
  );
  expect(moved).toBe(true);
  await context.close();
});
