import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { login } from "./helpers";

test("a submitted review appears only after moderation and updates the average", async ({ page, browser }, info) => {
  // Use a product with known seed reviews.
  await page.goto("/products/ballet-flat-rose");
  const countText = await page.getByText(/^\d+ reviews?$/).first().textContent();
  const before = Number(countText!.match(/\d+/)![0]);
  const name = `Tester${info.project.name}${Date.now().toString(36).slice(-4)}`;
  const body = `Lovely flats, very comfortable for long days. (${name})`;

  await page.getByRole("button", { name: "5 stars" }).click();
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Your review").fill(body);
  await page.waitForTimeout(3200); // humans take longer than 3s to write a review
  await page.getByRole("button", { name: "Submit review" }).click();
  await expect(page.getByText("Thank you for your review!")).toBeVisible();

  await page.reload();
  await expect(page.getByText(body)).toHaveCount(0);

  const admin = await browser.newPage();
  await login(admin);
  await admin.goto("/admin/reviews?status=pending");
  const card = admin.locator("li", { hasText: body });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(admin.locator("li", { hasText: body })).toHaveCount(0);

  await page.reload();
  await expect(page.getByText(body)).toBeVisible();
  await expect(page.getByText(new RegExp(`^${before + 1} reviews$`)).first()).toBeVisible();

  // Tidy up so averages stay stable across runs.
  await admin.goto("/admin/reviews?status=approved");
  admin.on("dialog", (d) => d.accept());
  await admin.locator("li", { hasText: body }).getByRole("button", { name: "Delete" }).click();
  await expect(admin.locator("li", { hasText: body })).toHaveCount(0);
  await admin.close();
});

test("spam and abusive reviews are caught by moderation", async ({ request }) => {
  // Every test shares one client IP, so start from a fresh review rate-limit window.
  const reset = new Pool({ connectionString: process.env.DATABASE_URL });
  await reset.query("delete from rate_limits where key like 'review:%'");
  await reset.end();
  const page = await request.get("/products/ballet-flat-rose");
  const html = await page.text();
  const productId = html.match(/"productId":"([0-9a-f-]{36})"/)?.[1] ?? html.match(/productId\\":\\"([0-9a-f-]{36})/)?.[1];
  expect(productId).toBeTruthy();
  // Honeypot filled → silently treated as spam
  const res = await request.post("/api/reviews", {
    headers: { origin: "http://localhost:3100" },
    data: { productId, rating: 5, displayName: "Bot", body: "Great product buy now at www.cheap.example and www.x.top", website: "http://spam", formToken: "x" },
  });
  expect(res.status()).toBe(201);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query("select status, moderation_flags from reviews where display_name = 'Bot' order by created_at desc limit 1");
  expect(rows[0].status).toBe("spam");
  expect(rows[0].moderation_flags).toContain("honeypot");
  await pool.query("delete from reviews where display_name = 'Bot'");
  await pool.end();
});
