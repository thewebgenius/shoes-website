import path from "node:path";
import sharp from "sharp";
import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";

export const FIX = (name: string) => path.resolve(__dirname, "../../test-results/fixtures", name);
export const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "owner@stridehaus.test";
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";

export async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Asserts a WebGL canvas exists and actually rendered non-uniform pixels (a real 3D scene, not a blank canvas). */
export async function expectRendered3D(page: Page) {
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  await expect
    .poll(
      async () => {
        const shot = await canvas.screenshot();
        const stats = await sharp(shot).stats();
        // A blank or single-colour canvas has ~0 deviation; a lit 3D scene does not.
        return Math.max(...stats.channels.slice(0, 3).map((c) => c.stdev));
      },
      { timeout: 45_000 },
    )
    .toBeGreaterThan(12);
  await expect(page.getByText(/Loading 3D model|Loading shoes/)).toHaveCount(0, { timeout: 60_000 });
}

/**
 * A product page that is not published renders the not-found UI with noindex and
 * never includes the product's details. (With streaming, Next.js commits the HTTP
 * status before the database lookup, so the status code itself can be 200.)
 */
export async function expectNotPublic(page: Page, slug: string, name: string) {
  const res = await page.request.get(`/products/${slug}`);
  const html = await res.text();
  expect(html).toContain('name="robots" content="noindex"');
  expect(html).not.toContain(name);
  expect(html).toMatch(/not found|couldn.t find/i);
}

/** Try-on is rate limited per visitor; tests reset the counters so runs are independent. */
export async function resetTryOnLimits() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("delete from rate_limits where key like 'tryon%'");
  await pool.end();
}
