/**
 * Seeds the database with an owner account and a sample catalogue built from
 * the 3D models in seed-assets/. Every product goes through the same image
 * pipeline (background removal → enhancement → crop/resize → embedding) that
 * the admin workflow uses. Safe to re-run: existing seed products are skipped.
 *
 * Usage: npm run db:seed
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../src/server/db/client";
import { products, productImages, reviews, users } from "../../src/server/db/schema";
import { hashPassword, passwordProblems } from "../../src/server/auth/password";
import { storage, storageKeys } from "../../src/server/storage";
import { aiProviders } from "../../src/server/ai/registry";
import { assignSampleModel, embedImage, setPrimaryImage, slugify } from "../../src/server/services/product-admin";
import sharp from "sharp";

type Seed = {
  model: string;
  name: string;
  category: "men" | "women" | "kids";
  gender: "male" | "female" | "unisex";
  shoeType: string;
  color: string;
  description: string;
  ratings: number[];
};

const CATALOG: Seed[] = [
  { model: "khronos-shoe-midnight", name: "Knit Runner Midnight", category: "men", gender: "male", shoeType: "Running sneaker", color: "Ocean Blue", description: "A breathable knit runner with a cushioned foam midsole and a padded heel collar, finished in deep ocean blue for everyday miles.", ratings: [5, 5, 4, 4] },
  { model: "khronos-shoe-street", name: "Knit Runner Street", category: "men", gender: "unisex", shoeType: "Running sneaker", color: "Black / Coral", description: "Our knit runner in a city-ready black colourway with coral accents. Lightweight, flexible and easy to pair.", ratings: [5, 4, 5] },
  { model: "aero-runner-cobalt", name: "Aero Runner Cobalt", category: "men", gender: "male", shoeType: "Running shoe", color: "Cobalt / White", description: "A low-profile runner with a sculpted sole and contrast side stripes. Built for quick sessions and long walks alike.", ratings: [4, 4, 3] },
  { model: "court-classic-white", name: "Court Classic White", category: "men", gender: "male", shoeType: "Court sneaker", color: "White / Green", description: "A clean leather court sneaker with a heel panel in racing green. The pair that goes with everything.", ratings: [5, 5, 5, 4, 4] },
  { model: "summit-high-black", name: "Summit High", category: "men", gender: "male", shoeType: "High-top sneaker", color: "Black / Red", description: "A high-top in smooth black leather with a cupped sole, toe cap and a flash of red at the ankle.", ratings: [4, 5] },
  { model: "chelsea-tan", name: "Chelsea Boot Tan", category: "men", gender: "male", shoeType: "Chelsea boot", color: "Tan", description: "A pull-on Chelsea boot in warm tan leather with elastic side gussets and a slim, stacked heel.", ratings: [5, 4, 4] },
  { model: "trail-hiker-olive", name: "Trail Hiker", category: "men", gender: "unisex", shoeType: "Hiking boot", color: "Stone / Olive", description: "A rugged suede hiker with a protective rubber mudguard, deep-lug outsole and bright orange laces.", ratings: [5, 5, 4] },
  { model: "penny-loafer-burgundy", name: "Penny Loafer Burgundy", category: "men", gender: "male", shoeType: "Loafer", color: "Burgundy", description: "A polished burgundy penny loafer with a saddle strap and hand-finished apron seam.", ratings: [4, 3, 5] },
  { model: "khronos-shoe-beach", name: "Knit Runner Beach", category: "women", gender: "female", shoeType: "Running sneaker", color: "Blush Pink", description: "The knit runner in a soft blush colourway. Breathable upper, springy sole, all-day comfort.", ratings: [5, 5, 4] },
  { model: "aero-runner-coral", name: "Aero Runner Coral", category: "women", gender: "female", shoeType: "Running shoe", color: "Coral", description: "A bright coral runner with a sculpted midsole and tonal stripes.", ratings: [4, 5] },
  { model: "court-classic-blush", name: "Court Classic Blush", category: "women", gender: "female", shoeType: "Court sneaker", color: "Blush / Raspberry", description: "Our court classic in pale blush leather with raspberry details.", ratings: [5, 4] },
  { model: "stiletto-pump-noir", name: "Stiletto Pump Noir", category: "women", gender: "female", shoeType: "Heeled pump", color: "Black", description: "A sleek black pump with a pointed toe and a slender stiletto heel.", ratings: [5, 4, 4] },
  { model: "stiletto-pump-nude", name: "Stiletto Pump Nude", category: "women", gender: "female", shoeType: "Heeled pump", color: "Nude", description: "The stiletto pump in a versatile nude tone that lengthens the leg.", ratings: [4, 4] },
  { model: "ballet-flat-rose", name: "Ballet Flat Rose", category: "women", gender: "female", shoeType: "Ballet flat", color: "Rose", description: "A soft rose ballet flat with a petite bow at the toe.", ratings: [5, 3] },
  { model: "riviera-sandal-cognac", name: "Riviera Sandal", category: "women", gender: "female", shoeType: "Strap sandal", color: "Cognac", description: "A strappy cognac leather sandal on a cushioned footbed with a gold-tone buckle.", ratings: [4, 5, 5] },
  { model: "cloud-slide-sand", name: "Cloud Slide", category: "women", gender: "unisex", shoeType: "Slide sandal", color: "Sand", description: "A plush slide with a wide padded band and a soft, contoured footbed.", ratings: [4, 4, 5] },
  { model: "kids-velcro-sky", name: "Kids Velcro Sky", category: "kids", gender: "unisex", shoeType: "Kids sneaker", color: "Sky Blue / Orange", description: "Easy on, easy off: twin hook-and-loop straps, a tough toe bumper and a playful star badge.", ratings: [5, 5, 4] },
  { model: "kids-velcro-berry", name: "Kids Velcro Berry", category: "kids", gender: "unisex", shoeType: "Kids sneaker", color: "Berry / Aqua", description: "The kids' velcro sneaker in berry with aqua straps.", ratings: [5, 4] },
  { model: "kids-high-lime", name: "Kids High Lime", category: "kids", gender: "unisex", shoeType: "Kids high-top", color: "Lime / Navy", description: "A bright lime high-top with a rubber toe cap and padded ankle.", ratings: [4, 5] },
];

const REVIEW_TEXT: Record<number, string[]> = {
  5: ["Looks even better in person. Very comfortable from day one.", "Spinning it around in 3D sold me, and it matched exactly.", "Great quality and the colour is spot on."],
  4: ["Really nice pair. Took a couple of days to break in.", "Comfortable and stylish. Would buy again.", "Good value, looks premium."],
  3: ["Decent, but runs a little narrow for me.", "Nice design, average comfort."],
  2: ["Not quite what I expected."],
  1: ["Didn't work for me."],
};
const NAMES = ["Aarav", "Sita", "Bibek", "Prakriti", "Rohan", "Anjali", "Suman", "Nisha", "Kiran", "Maya", "Ramesh", "Pooja"];

async function ensureOwner() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!email) throw new Error("Set SEED_ADMIN_EMAIL");
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return existing;
  let password = process.env.SEED_ADMIN_PASSWORD ?? "";
  let generated = false;
  if (!password) {
    password = randomBytes(18).toString("base64url") + "!A1";
    generated = true;
  }
  const problem = passwordProblems(password);
  if (problem) throw new Error(`SEED_ADMIN_PASSWORD is too weak: ${problem}`);
  const [user] = await db
    .insert(users)
    .values({ email, name: "Store Owner", role: "admin", passwordHash: await hashPassword(password) })
    .returning();
  console.log(`Created admin ${email}${generated ? ` with generated password: ${password}\n(Shown once. Store it in a password manager.)` : ""}`);
  return user;
}

async function main() {
  const owner = await ensureOwner();
  const actor = { id: owner.id, email: owner.email, name: owner.name, role: owner.role };
  const providers = aiProviders();
  const imagesDir = path.resolve(__dirname, "../../seed-assets/images");

  for (const [n, s] of CATALOG.entries()) {
    const slug = slugify(s.name);
    const [exists] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
    if (exists) {
      console.log("skip", slug);
      continue;
    }
    const [p] = await db
      .insert(products)
      .values({
        slug,
        name: s.name,
        category: s.category,
        gender: s.gender,
        shoeType: s.shoeType,
        color: s.color,
        description: s.description,
        status: "draft",
        metadataVerified: true,
        createdBy: owner.id,
      })
      .returning();

    for (const [i, file] of [`${s.model}.png`, `${s.model}-side.png`].entries()) {
      const full = path.join(imagesDir, file);
      if (!fs.existsSync(full)) continue;
      const rawBuf = await sharp(full).png().toBuffer();
      const meta = await sharp(rawBuf).metadata();
      const [raw] = await db
        .insert(productImages)
        .values({ productId: p.id, kind: "raw", storageKey: "pending", mimeType: "image/png", width: meta.width!, height: meta.height!, bytes: rawBuf.length })
        .returning();
      const rawKey = storageKeys.rawImage(p.id, raw.id);
      await storage().put(rawKey, rawBuf);
      await db.update(productImages).set({ storageKey: rawKey }).where(eq(productImages.id, raw.id));

      const result = await providers.imageEnhancement.enhance(rawBuf);
      const [img] = await db
        .insert(productImages)
        .values({
          productId: p.id,
          kind: "processed",
          sourceImageId: raw.id,
          storageKey: "pending",
          mimeType: "image/webp",
          width: 1200,
          height: 1200,
          bytes: result.processed.length,
          variants: [400, 800, 1200],
          processingProvider: providers.imageEnhancement.id,
          altText: `${s.name} – ${s.color} ${s.shoeType.toLowerCase()}${i ? ", side view" : ""}`,
        })
        .returning();
      for (const v of [400, 800, 1200]) {
        const buf = await sharp(result.processed).resize(v, v, { fit: "inside" }).webp({ quality: v >= 1200 ? 84 : 80 }).toBuffer();
        await storage().put(storageKeys.productImage(p.id, img.id, v), buf);
      }
      await storage().put(storageKeys.cutout(p.id, img.id), result.cutout);
      await db.update(productImages).set({ storageKey: storageKeys.productImage(p.id, img.id, 1200) }).where(eq(productImages.id, img.id));
      if (i === 0) await setPrimaryImage(p.id, img.id);
      await embedImage(p.id, img.id, result.cutout, actor);
    }

    await assignSampleModel(p.id, s.model, actor);
    await db.update(products).set({ status: "published", publishedAt: new Date(Date.now() - n * 3600_000), publishedBy: owner.id }).where(eq(products.id, p.id));

    for (const [j, rating] of s.ratings.entries()) {
      const pool = REVIEW_TEXT[rating];
      await db.insert(reviews).values({
        productId: p.id,
        rating,
        displayName: NAMES[(n * 3 + j) % NAMES.length],
        body: pool[(n + j) % pool.length],
        status: "approved",
        moderatedBy: owner.id,
        moderatedAt: new Date(),
        createdAt: new Date(Date.now() - (j + 1) * 86400_000 * (1 + (n % 5))),
      });
    }
    console.log("seeded", slug);
  }

  // A couple of reviews waiting for moderation so the queue is not empty.
  const [first] = await db.select().from(products).where(eq(products.slug, "knit-runner-midnight")).limit(1);
  const pending = await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.status, "pending")).limit(1);
  if (first && !pending.length) {
    await db.insert(reviews).values([
      { productId: first.id, rating: 4, displayName: "Dipesh", body: "Fits well and the blue is gorgeous. Laces are a bit long.", status: "pending", moderationFlags: [] },
      { productId: first.id, rating: 1, displayName: "promo", body: "Cheap shoes!!! visit www.example-spam.top for discount code", status: "pending", moderationFlags: ["contains_link", "spam_phrase"] },
    ]);
  }
  console.log("Seed complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
