import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { Pool } from "pg";

export const FIXTURES = path.resolve(__dirname, "../../test-results/fixtures");

/** Builds test images and clears rate-limit counters so repeated runs are deterministic. */
export default async function globalSetup() {
  fs.mkdirSync(FIXTURES, { recursive: true });
  const img = path.resolve(__dirname, "../../seed-assets/images");
  // A "raw" shopkeeper photo: render on a warm, uneven backdrop.
  const shoe = await sharp(path.join(img, "trail-hiker-olive.png")).resize(900).toBuffer();
  const backdrop = await sharp({ create: { width: 1400, height: 1100, channels: 3, background: "#d9cfbf" } })
    .composite([{ input: shoe, left: 250, top: 120, blend: "multiply" }])
    .jpeg({ quality: 88 })
    .toBuffer();
  fs.writeFileSync(path.join(FIXTURES, "raw-shoe.jpg"), backdrop);
  // A customer photo for visual search: side view, flipped, on grey.
  const side = await sharp(path.join(img, "chelsea-tan-side.png")).flop().resize(800).toBuffer();
  fs.writeFileSync(
    path.join(FIXTURES, "search-photo.jpg"),
    await sharp({ create: { width: 1000, height: 900, channels: 3, background: "#c9c6c0" } }).composite([{ input: side, left: 100, top: 80, blend: "multiply" }]).jpeg().toBuffer(),
  );
  // A customer photo for try-on (a plain scene; no real person needed for the mock).
  fs.writeFileSync(
    path.join(FIXTURES, "person.jpg"),
    await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#8aa1b1" } })
      .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect y="800" width="900" height="400" fill="#6b5b4b"/><ellipse cx="450" cy="300" rx="120" ry="150" fill="#e0c3a8"/></svg>`), left: 0, top: 0 }])
      .jpeg()
      .toBuffer(),
  );
  fs.writeFileSync(path.join(FIXTURES, "not-an-image.jpg"), Buffer.from("<?php echo 'hi'; ?>"));
  fs.copyFileSync(path.resolve(__dirname, "../../seed-assets/models/kids-high-lime.glb"), path.join(FIXTURES, "model.glb"));
  fs.writeFileSync(path.join(FIXTURES, "fake.glb"), Buffer.concat([Buffer.from("glTF"), Buffer.alloc(40)]));

  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query("delete from rate_limits");
    await pool.query("update users set failed_login_count = 0, locked_until = null");
    await pool.end();
  }
}
