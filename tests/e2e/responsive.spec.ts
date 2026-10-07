import { expect, test } from "@playwright/test";

for (const path of ["/", "/showroom", "/showroom/kids", "/men", "/products/kids-velcro-sky", "/try-on", "/find-my-shoe", "/about", "/privacy", "/terms", "/admin/login"]) {
  test(`no horizontal overflow on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.locator("main, form").first()).toBeVisible();
  });
}

test("mobile navigation menu works", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "Find My Shoe" }).click();
  await expect(page).toHaveURL(/find-my-shoe/);
});

test("3D assets are lazy-loaded: no GLB is requested on the home page", async ({ page }) => {
  const glb: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/media/model/")) glb.push(r.url());
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(glb).toHaveLength(0);
});
