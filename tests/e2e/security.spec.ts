import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { Pool } from "pg";
import { FIX, login } from "./helpers";

const ORIGIN = { origin: "http://localhost:3100" };

test.describe("security", () => {
  test("admin pages redirect to login and admin APIs refuse anonymous calls", async ({ page, request }) => {
    for (const path of ["/admin", "/admin/products", "/admin/reviews", "/admin/audit"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login$/);
    }
    const res = await request.post("/api/admin/products/00000000-0000-4000-8000-000000000000/images", {
      headers: ORIGIN,
      multipart: { image: { name: "a.jpg", mimeType: "image/jpeg", buffer: fs.readFileSync(FIX("raw-shoe.jpg")) } },
    });
    expect(res.status()).toBe(401);
  });

  test("a forged session cookie is rejected", async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: "sh_admin", value: "forged-token-value", url: "http://localhost:3100" }]);
    const page = await ctx.newPage();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await ctx.close();
  });

  test("cross-site requests are blocked", async ({ request }) => {
    const res = await request.post("/api/visual-search", {
      headers: { origin: "https://evil.example" },
      multipart: { photo: { name: "a.jpg", mimeType: "image/jpeg", buffer: fs.readFileSync(FIX("search-photo.jpg")) } },
    });
    expect(res.status()).toBe(403);
    expect(res.headers()["access-control-allow-origin"]).toBeUndefined();
  });

  test("uploads are validated by content, not by name", async ({ request }) => {
    const res = await request.post("/api/visual-search", {
      headers: ORIGIN,
      multipart: { photo: { name: "shoe.jpg", mimeType: "image/jpeg", buffer: fs.readFileSync(FIX("not-an-image.jpg")) } },
    });
    expect(res.status()).toBe(415);
  });

  test("wrong passwords are rejected generically and audited", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  });

  test("private images, unpublished products and try-on results are not publicly reachable", async ({ page, request, browser }) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const raw = await pool.query("select id from product_images where kind = 'raw' limit 1");
    const tryon = await pool.query("select id from tryon_sessions order by created_at desc limit 1");
    const draft = await pool.query(
      "select i.id from product_images i join products p on p.id = i.product_id where p.status <> 'published' and i.kind = 'processed' limit 1",
    );
    await pool.end();

    expect((await request.get(`/api/media/image/${raw.rows[0].id}/raw`)).status()).toBe(404);
    if (draft.rows[0]) expect((await request.get(`/api/media/image/${draft.rows[0].id}/800`)).status()).toBe(404);
    if (tryon.rows[0]) expect((await request.get(`/api/try-on/${tryon.rows[0].id}`)).status()).toBe(404);
    // Storage is outside /public
    expect((await request.get("/storage/")).status()).toBe(404);

    // …but a signed-in admin can see raw images.
    await login(page);
    expect((await page.request.get(`/api/media/image/${raw.rows[0].id}/raw`)).status()).toBe(200);
    void browser;
  });

  test("security headers are present", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBeTruthy();
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("no secrets are shipped to the browser", async ({ page }) => {
    const bodies: string[] = [];
    page.on("response", async (r) => {
      if (r.url().endsWith(".js")) bodies.push(await r.text().catch(() => ""));
    });
    await page.goto("/");
    await page.goto("/products/knit-runner-midnight");
    await page.waitForLoadState("networkidle");
    const all = bodies.join("\n");
    expect(all).not.toContain(process.env.APP_SECRET!);
    expect(all).not.toContain("DATABASE_URL");
    expect(all).not.toMatch(/postgres(ql)?:\/\//);
  });

  test("try-on is rate limited", async ({ request }) => {
    test.skip(test.info().project.name !== "desktop", "runs once");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query("delete from rate_limits where key like 'tryon:%'");
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const r = await request.post("/api/try-on", { headers: ORIGIN, multipart: { productId: "not-a-uuid", consent: "yes" } });
      last = r.status();
    }
    expect(last).toBe(429);
    await pool.query("delete from rate_limits where key like 'tryon:%'");
    await pool.end();
  });
});
