import { expect, test } from "@playwright/test";
import { FIX, login } from "./helpers";

/**
 * Runs against a second server started with no AI providers configured
 * (see playwright.config.ts). Nothing may pretend to be AI: every AI feature
 * says "AI provider not configured", no fake success, no fake confidence.
 */

test("Try-On Lab says the AI provider is not configured", async ({ page, request }) => {
  await page.goto("/try-on");
  await expect(page.getByText("AI provider not configured")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate try-on preview" })).toHaveCount(0);
  const res = await request.post("/api/try-on", { headers: { origin: test.info().project.use.baseURL! }, data: { productId: "00000000-0000-4000-8000-000000000000" } });
  // No photo cookie → 410 before the provider is even considered; with a photo the API answers 503 + notConfigured.
  expect([410, 503]).toContain(res.status());
});

test("shopkeeper sees 'AI provider not configured' instead of a fake result", async ({ page }) => {
  await login(page);
  await page.goto("/admin/products/new");
  await page.getByLabel("Name", { exact: true }).fill(`E2E Unconfigured ${Date.now().toString(36)}`);
  await page.getByLabel("Category (showroom section)").selectOption("women");
  await page.getByRole("button", { name: "Create draft & add photo" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}\?created=1/);

  await expect(page.getByText("AI provider not configured.").first()).toBeVisible();
  await page.getByTestId("raw-image-input").setInputFiles(FIX("raw-shoe.jpg"));
  await expect(page.getByRole("status").filter({ hasText: "AI provider not configured" }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("job-status").first()).toHaveText(/AI provider not configured/);
  // The original is kept; nothing claims success or confidence.
  await expect(page.getByRole("img", { name: "Original upload" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Processed product" })).toHaveCount(0);
  await expect(page.getByText(/AI processing completed|% confidence/)).toHaveCount(0);
  await expect(page.getByTestId("ai-suggestions")).toHaveCount(0);

  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Archived.").first()).toBeVisible();
});
