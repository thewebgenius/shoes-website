import "server-only";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { analyticsEvents, products, reviews, visualSearchSessions, type AnalyticsEventType } from "../db/schema";

/** Basic, privacy-friendly event tracking. Visitors are identified only by a keyed hash. */
export async function track(type: AnalyticsEventType, opts: { productId?: string | null; visitorHash?: string | null; metadata?: Record<string, unknown> } = {}) {
  try {
    await db.insert(analyticsEvents).values({ type, productId: opts.productId ?? null, visitorHash: opts.visitorHash ?? null, metadata: opts.metadata ?? null });
  } catch (e) {
    // Analytics must never break the user's action.
    console.error("[analytics]", type, (e as Error).message);
  }
}

type Ranked = Array<{ productId: string; name: string; slug: string; value: number }>;

async function topByEvent(type: AnalyticsEventType, since: Date, limit = 5): Promise<Ranked> {
  const rows = await db
    .select({ productId: products.id, name: products.name, slug: products.slug, value: sql<number>`count(*)::int` })
    .from(analyticsEvents)
    .innerJoin(products, eq(products.id, analyticsEvents.productId))
    .where(and(eq(analyticsEvents.type, type), gte(analyticsEvents.createdAt, since)))
    .groupBy(products.id, products.name, products.slug)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  return rows.map((r) => ({ ...r, value: Number(r.value) }));
}

export async function dashboardAnalytics(days = 30) {
  const since = new Date(Date.now() - days * 86400_000);
  const totals = await db
    .select({ type: analyticsEvents.type, n: sql<number>`count(*)::int` })
    .from(analyticsEvents)
    .where(gte(analyticsEvents.createdAt, since))
    .groupBy(analyticsEvents.type);

  const mostSearched = await db
    .select({ productId: products.id, name: products.name, slug: products.slug, value: sql<number>`count(*)::int` })
    .from(visualSearchSessions)
    .innerJoin(products, eq(products.id, visualSearchSessions.topProductId))
    .where(and(isNotNull(visualSearchSessions.topProductId), gte(visualSearchSessions.createdAt, since)))
    .groupBy(products.id, products.name, products.slug)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  const highestRated = await db
    .select({
      productId: products.id,
      name: products.name,
      slug: products.slug,
      value: sql<number>`avg(${reviews.rating})::float`,
      count: sql<number>`count(*)::int`,
    })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(and(eq(reviews.status, "approved"), eq(products.status, "published")))
    .groupBy(products.id, products.name, products.slug)
    .orderBy(desc(sql`avg(${reviews.rating})`), desc(sql`count(*)`))
    .limit(5);

  return {
    days,
    totals: Object.fromEntries(totals.map((t) => [t.type, Number(t.n)])) as Partial<Record<AnalyticsEventType, number>>,
    mostViewed: await topByEvent("product_view", since),
    most3dInteractions: await topByEvent("model_interaction", since),
    mostTriedOn: await topByEvent("tryon_complete", since),
    mostSearched: mostSearched.map((r) => ({ ...r, value: Number(r.value) })),
    highestRated: highestRated.map((r) => ({ ...r, value: Math.round(Number(r.value) * 10) / 10, count: Number(r.count) })),
  };
}
