import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { product3dAssets, productImages, products, reviews, type ProductCategory } from "../db/schema";

/** Read-side catalogue queries for the public site. Only published products are ever returned. */

export type CatalogCard = {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  gender: string;
  shoeType: string | null;
  brand: string | null;
  color: string | null;
  image: { id: string; variants: number[]; alt: string } | null;
  model: { id: string; source: "admin_upload" | "ai_generated" | "sample_library"; bytes: number } | null;
  rating: { average: number; count: number };
};

export async function listPublished(opts: { category?: ProductCategory; limit?: number; ids?: string[]; newest?: boolean } = {}): Promise<CatalogCard[]> {
  const where = [eq(products.status, "published")];
  if (opts.category) where.push(eq(products.category, opts.category));
  if (opts.ids) {
    if (opts.ids.length === 0) return [];
    where.push(inArray(products.id, opts.ids));
  }
  const rows = await db
    .select({
      p: products,
      imageId: productImages.id,
      imageVariants: productImages.variants,
      imageAlt: productImages.altText,
      modelId: product3dAssets.id,
      modelSource: product3dAssets.source,
      modelBytes: product3dAssets.bytes,
      avg: sql<string | null>`(select avg(r.rating)::numeric(3,2) from reviews r where r.product_id = ${products.id} and r.status = 'approved')`,
      count: sql<number>`(select count(*)::int from reviews r where r.product_id = ${products.id} and r.status = 'approved')`,
    })
    .from(products)
    .leftJoin(productImages, and(eq(productImages.productId, products.id), eq(productImages.isPrimary, true), eq(productImages.kind, "processed")))
    .leftJoin(product3dAssets, and(eq(product3dAssets.productId, products.id), eq(product3dAssets.isPrimary, true)))
    .where(and(...where))
    .orderBy(...(opts.newest ? [desc(products.publishedAt)] : [asc(products.category), desc(products.publishedAt), asc(products.name)]))
    .limit(opts.limit ?? 200);
  return rows.map(toCard);
}

function toCard(r: {
  p: typeof products.$inferSelect;
  imageId: string | null;
  imageVariants: number[] | null;
  imageAlt: string | null;
  modelId: string | null;
  modelSource: "admin_upload" | "ai_generated" | "sample_library" | null;
  modelBytes: number | null;
  avg: string | null;
  count: number;
}): CatalogCard {
  return {
    id: r.p.id,
    slug: r.p.slug,
    name: r.p.name,
    category: r.p.category,
    gender: r.p.gender,
    shoeType: r.p.shoeType,
    brand: r.p.brand,
    color: r.p.color,
    image: r.imageId ? { id: r.imageId, variants: r.imageVariants ?? [], alt: r.imageAlt ?? r.p.name } : null,
    model: r.modelId ? { id: r.modelId, source: r.modelSource!, bytes: r.modelBytes ?? 0 } : null,
    rating: { average: r.avg ? Number(r.avg) : 0, count: Number(r.count) },
  };
}

export type ProductDetail = CatalogCard & {
  description: string | null;
  publishedAt: Date | null;
  model: (CatalogCard["model"] & { license: string | null; attribution: string | null }) | null;
};

export async function getPublishedBySlug(slug: string): Promise<ProductDetail | null> {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null;
  const [p] = await db.select().from(products).where(and(eq(products.slug, slug), eq(products.status, "published"))).limit(1);
  if (!p) return null;
  const [card] = await listPublished({ ids: [p.id] });
  const [asset] = await db
    .select({ license: product3dAssets.license, attribution: product3dAssets.attribution })
    .from(product3dAssets)
    .where(and(eq(product3dAssets.productId, p.id), eq(product3dAssets.isPrimary, true)))
    .limit(1);
  return {
    ...card,
    description: p.description,
    publishedAt: p.publishedAt,
    model: card.model ? { ...card.model, license: asset?.license ?? null, attribution: asset?.attribution ?? null } : null,
  };
}

export type RatingSummary = { average: number; count: number; distribution: Record<1 | 2 | 3 | 4 | 5, number> };

export async function ratingSummary(productId: string): Promise<RatingSummary> {
  const rows = await db
    .select({ rating: reviews.rating, n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.status, "approved")))
    .groupBy(reviews.rating);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as RatingSummary["distribution"];
  let count = 0;
  let sum = 0;
  for (const r of rows) {
    distribution[r.rating as 1 | 2 | 3 | 4 | 5] = Number(r.n);
    count += Number(r.n);
    sum += r.rating * Number(r.n);
  }
  return { average: count ? Math.round((sum / count) * 100) / 100 : 0, count, distribution };
}

export async function approvedReviews(productId: string, sort: "newest" | "helpful" = "newest", limit = 50) {
  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      displayName: reviews.displayName,
      body: reviews.body,
      helpfulCount: reviews.helpfulCount,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.status, "approved")))
    .orderBy(sort === "helpful" ? desc(reviews.helpfulCount) : desc(reviews.createdAt), desc(reviews.createdAt))
    .limit(limit);
}

export async function categoryCounts(): Promise<Record<ProductCategory, number>> {
  const rows = await db
    .select({ category: products.category, n: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.status, "published"))
    .groupBy(products.category);
  const out = { men: 0, women: 0, kids: 0 } as Record<ProductCategory, number>;
  for (const r of rows) out[r.category] = Number(r.n);
  return out;
}

export async function publishedImages(productId: string) {
  return db
    .select({ id: productImages.id, variants: productImages.variants, alt: productImages.altText, isPrimary: productImages.isPrimary })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(and(eq(productImages.productId, productId), eq(productImages.kind, "processed"), eq(products.status, "published")))
    .orderBy(desc(productImages.isPrimary), asc(productImages.createdAt));
}
