import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { visualSearchSessions } from "../db/schema";
import { aiProviders } from "../ai/registry";
import type { ValidatedImage } from "../security/upload";
import { track } from "./analytics";
import { listPublished, type CatalogCard } from "./catalog";

/**
 * "Find My Shoe": photo → detect/crop the shoe → embedding → pgvector nearest
 * neighbours over published product images → top matches.
 *
 * The similarity score is a ranking signal between catalogue items, not a
 * probability that the shoes are the same. The uploaded photo is not stored.
 */

export type VisualMatch = CatalogCard & { rank: number; similarity: number };

/**
 * A photo that is not a shoe still has a nearest neighbour in the catalogue, so
 * returning the top 5 unconditionally dresses up noise as a result. A genuine
 * shoe query scores high against one product and clearly higher than the rest;
 * an unrelated photo scores middling against everything. Both conditions must
 * hold before any match is shown.
 */
const MIN_SIMILARITY = 0.8;
const MIN_MARGIN = 0.06;

export async function visualSearch(photo: ValidatedImage, ipHash: string, limit = 5) {
  const provider = aiProviders().embedding;
  const started = Date.now();
  try {
    const vector = await provider.embed(photo.buffer);
    const literal = `[${vector.map((v) => (Number.isFinite(v) ? v.toFixed(6) : "0")).join(",")}]`;
    // Best image per published product, ordered by cosine distance (HNSW index).
    const rows = await db.execute<{ product_id: string; distance: number }>(sql`
      select product_id, min(distance) as distance from (
        select i.product_id, (i.embedding <=> ${literal}::vector) as distance
        from product_images i
        join products p on p.id = i.product_id
        where p.status = 'published' and i.kind = 'processed' and i.embedding is not null
          and i.embedding_model = ${provider.model}
        order by i.embedding <=> ${literal}::vector
        limit ${limit * 4}
      ) ranked
      group by product_id
      order by distance asc
      limit ${limit}
    `);
    const scored = rows.rows.map((r) => ({ productId: r.product_id, similarity: Math.max(0, 1 - Number(r.distance)) }));
    const cards = await listPublished({ ids: scored.map((s) => s.productId) });
    const byId = new Map(cards.map((c) => [c.id, c]));
    const matches: VisualMatch[] = scored
      .filter((s) => byId.has(s.productId))
      .map((s, i) => ({ ...byId.get(s.productId)!, rank: i + 1, similarity: Math.round(s.similarity * 1000) / 1000 }));

    const best = matches[0]?.similarity ?? 0;
    const margin = best - (matches[1]?.similarity ?? 0);
    const confident = matches.length > 0 && best >= MIN_SIMILARITY && (matches.length === 1 || margin >= MIN_MARGIN);

    await db.insert(visualSearchSessions).values({
      status: "completed",
      provider: provider.id,
      results: matches.map((m) => ({ productId: m.id, score: m.similarity })),
      topProductId: confident ? (matches[0]?.id ?? null) : null,
      ipHash,
      durationMs: Date.now() - started,
    });
    await track("visual_search", { productId: confident ? (matches[0]?.id ?? null) : null, visitorHash: ipHash, metadata: { results: matches.length, confident } });
    if (!confident) return { ok: true as const, matches: [], noMatch: true as const, isMock: provider.isMock, providerLabel: provider.label };
    return { ok: true as const, matches, noMatch: false as const, isMock: provider.isMock, providerLabel: provider.label };
  } catch (e) {
    console.error("[visual-search]", (e as Error).message);
    await db
      .insert(visualSearchSessions)
      .values({ status: "failed", provider: provider.id, ipHash, durationMs: Date.now() - started, error: String((e as Error).message).slice(0, 300) })
      .catch(() => undefined);
    return { ok: false as const, error: "We couldn't analyse that photo. Try a clearer picture of a single shoe." };
  } finally {
    photo.buffer.fill(0);
  }
}
