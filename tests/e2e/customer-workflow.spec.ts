import { expect, test } from "@playwright/test";
import { FIX, expectRendered3D } from "./helpers";

/** 88.18: HOME → SHOWROOM → MEN/WOMEN/KIDS → SELECT SHOE → INTERACTIVE 3D → ROTATE/ZOOM → READ REVIEWS → TRY-ON */
test("customer explores the showroom, inspects a shoe in 3D, reads reviews and tries it on", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: /Enter the 3D showroom/ }).click();
  await expect(page).toHaveURL(/\/showroom$/);

  await page.locator('main a[href="/showroom/women"]').first().click();
  await expect(page).toHaveURL(/\/showroom\/women/);
  await expectRendered3D(page);

  // Select a case through the scene controls (works with mouse and touch) and open it.
  await page.getByRole("button", { name: "Next shoe" }).click();
  const open = page.getByRole("link", { name: /Open in 3D & reviews/ });
  await expect(open).toBeVisible();
  await open.click();
  await expect(page).toHaveURL(/\/products\//);

  // Interactive 3D viewer: real WebGL render, rotate, zoom, reset.
  await expectRendered3D(page);
  const canvas = page.locator("canvas").first();
  const before = await canvas.screenshot();
  const box = (await canvas.boundingBox())!;
  if (isMobile) {
    // Touch drag via pointer events
    await canvas.dispatchEvent("pointerdown", { pointerType: "touch", clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, isPrimary: true, pointerId: 1, button: 0, buttons: 1 });
    for (let i = 1; i <= 8; i++) {
      await canvas.dispatchEvent("pointermove", { pointerType: "touch", clientX: box.x + box.width / 2 + i * 20, clientY: box.y + box.height / 2, isPrimary: true, pointerId: 1, buttons: 1 });
    }
    await canvas.dispatchEvent("pointerup", { pointerType: "touch", clientX: box.x + box.width / 2 + 160, clientY: box.y + box.height / 2, isPrimary: true, pointerId: 1 });
  } else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
  }
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForTimeout(600);
  const after = await canvas.screenshot();
  expect(Buffer.compare(before, after)).not.toBe(0);
  await page.getByRole("button", { name: "Reset camera" }).click();
  await page.getByRole("button", { name: /auto-rotate/i }).click();

  // Reviews
  await page.getByRole("heading", { name: "Reviews" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("list", { name: "Rating distribution" })).toBeVisible();
  await expect(page.getByText(/\d review/).first()).toBeVisible();

  // Try it on
  await page.getByRole("link", { name: "Try it on" }).first().click();
  await expect(page).toHaveURL(/\/try-on\?product=/);
  await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);
  await page.getByLabel("Choose photo").setInputFiles(FIX("person.jpg"));
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Generate try-on preview" }).click();
  const result = page.getByRole("img", { name: /AI-generated visual preview/ });
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("AI-generated visual preview").first()).toBeVisible();
  await expect(page.getByText(/does not predict size, fit or comfort/)).toBeVisible();
  const src = await result.getAttribute("src");
  // The browser that created it can read it…
  expect((await page.request.get(src!)).status()).toBe(200);
  // …and deleting removes it.
  await page.getByRole("button", { name: "Delete now" }).click();
  await expect(result).toHaveCount(0);
  expect((await page.request.get(src!)).status()).toBe(404);
});

/** FIND MY SHOE → UPLOAD → AI VISUAL SEARCH → VIEW MATCHES → SELECT SHOE → TRY IT ON */
test("customer finds a shoe from a photo and sends it to try-on", async ({ page }) => {
  await page.goto("/find-my-shoe");
  await page.getByLabel("Choose photo").setInputFiles(FIX("search-photo.jpg"));
  await page.getByRole("button", { name: "Find visually similar shoes" }).click();
  await expect(page.getByRole("heading", { name: "Visually similar shoes" })).toBeVisible({ timeout: 60_000 });
  const items = page.locator("ol > li");
  await expect(items).toHaveCount(5);
  // The photographed boot should rank first.
  await expect(items.first()).toContainText("Chelsea Boot Tan");
  await expect(items.first()).toContainText("Closest match");
  // Open a result
  await items.first().getByRole("link", { name: /View in 3D/ }).click();
  await expect(page.getByRole("heading", { name: "Chelsea Boot Tan" })).toBeVisible();
  await page.goBack();
  await page.goto("/find-my-shoe");
  await page.getByLabel("Choose photo").setInputFiles(FIX("search-photo.jpg"));
  await page.getByRole("button", { name: "Find visually similar shoes" }).click();
  await expect(page.locator("ol > li").first()).toBeVisible({ timeout: 60_000 });
  await page.locator("ol > li").first().getByRole("link", { name: "Try it on" }).click();
  await expect(page).toHaveURL(/\/try-on\?product=chelsea-boot-tan/);
  await expect(page.locator('[role="option"][aria-selected="true"]')).toContainText("Chelsea Boot Tan");
});
