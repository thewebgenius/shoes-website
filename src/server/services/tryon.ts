import "server-only";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { productImages, products, tryonSessions } from "../db/schema";
import { aiProviders } from "../ai/registry";
import { DEFAULT_PLACEMENT } from "../ai/types";
import { env } from "../env";
import { randomToken, safeEqual, sha256 } from "../security/crypto";
import { storage, storageKeys } from "../storage";
import type { ValidatedImage } from "../security/upload";
import { track } from "./analytics";

/**
 * Virtual try-on.
 *
 * Privacy model:
 *  - The customer photo exists only in memory for the duration of the request.
 *    It is never written to disk, the database or a public URL, and never used for training.
 *  - The generated preview is stored privately for a short time (TRYON_RESULT_TTL_MINUTES)
 *    so the customer can view it, readable only with a random per-session token held in an
 *    HttpOnly cookie. It is deleted on expiry or when the customer deletes it.
 */

export type TryOnOutcome =
  | { ok: true; sessionId: string; token: string; expiresAt: Date; isMock: boolean; providerLabel: string }
  | { ok: false; error: string; status: number };

const placementSchema = z.object({
  x: z.coerce.number().min(0).max(1).catch(DEFAULT_PLACEMENT.x),
  y: z.coerce.number().min(0).max(1).catch(DEFAULT_PLACEMENT.y),
  scale: z.coerce.number().min(0.08).max(1).catch(DEFAULT_PLACEMENT.scale),
});

export async function runTryOn(opts: { productId: string; photo: ValidatedImage; ipHash: string; placement?: unknown }): Promise<TryOnOutcome> {
  if (!z.string().uuid().safeParse(opts.productId).success) return { ok: false, error: "Choose a shoe from the catalogue.", status: 400 };
  const [row] = await db
    .select({ p: products, img: productImages })
    .from(products)
    .innerJoin(productImages, and(eq(productImages.productId, products.id), eq(productImages.kind, "processed"), eq(productImages.isPrimary, true)))
    .where(and(eq(products.id, opts.productId), eq(products.status, "published")))
    .limit(1);
  if (!row) return { ok: false, error: "That shoe is not available for try-on.", status: 404 };

  const provider = aiProviders().tryOn;
  await track("tryon_start", { productId: row.p.id, visitorHash: opts.ipHash, metadata: { provider: provider.id } });
  const [session] = await db
    .insert(tryonSessions)
    .values({ productId: row.p.id, provider: provider.id, isMock: provider.isMock, status: "processing", ipHash: opts.ipHash })
    .returning();
  const started = Date.now();
  let personImage: Buffer | null = opts.photo.buffer;
  try {
    const productImage = await storage().get(storageKeys.cutout(row.p.id, row.img.id));
    const placement = placementSchema.parse(opts.placement ?? DEFAULT_PLACEMENT);
    const { image } = await provider.tryOn({ personImage, productImage, productName: row.p.name, placement });
    const token = randomToken(24);
    const key = storageKeys.tryonResult(session.id);
    await storage().put(key, image);
    const expiresAt = new Date(Date.now() + env().TRYON_RESULT_TTL_MINUTES * 60_000);
    await db
      .update(tryonSessions)
      .set({ status: "completed", resultStorageKey: key, accessTokenHash: sha256(token), expiresAt, durationMs: Date.now() - started })
      .where(eq(tryonSessions.id, session.id));
    await track("tryon_complete", { productId: row.p.id, visitorHash: opts.ipHash, metadata: { provider: provider.id } });
    return { ok: true, sessionId: session.id, token, expiresAt, isMock: provider.isMock, providerLabel: provider.label };
  } catch (e) {
    console.error("[tryon]", (e as Error).message);
    await db
      .update(tryonSessions)
      .set({ status: "failed", error: String((e as Error).message).slice(0, 300), durationMs: Date.now() - started })
      .where(eq(tryonSessions.id, session.id));
    return { ok: false, error: "We couldn't generate a preview this time. Please try again with a different photo.", status: 502 };
  } finally {
    // Drop our reference to the customer photo; nothing else holds it.
    personImage = null;
    opts.photo.buffer.fill(0);
  }
}

export async function readTryOnResult(sessionId: string, token: string | undefined) {
  if (!z.string().uuid().safeParse(sessionId).success || !token) return null;
  const [s] = await db.select().from(tryonSessions).where(eq(tryonSessions.id, sessionId)).limit(1);
  if (!s || s.status !== "completed" || !s.accessTokenHash || !s.resultStorageKey) return null;
  if (!safeEqual(s.accessTokenHash, sha256(token))) return null;
  if (!s.expiresAt || s.expiresAt < new Date()) {
    await expireSession(s.id, s.resultStorageKey);
    return null;
  }
  return storage().get(s.resultStorageKey).catch(() => null);
}

export async function deleteTryOnResult(sessionId: string, token: string | undefined) {
  if (!z.string().uuid().safeParse(sessionId).success || !token) return false;
  const [s] = await db.select().from(tryonSessions).where(eq(tryonSessions.id, sessionId)).limit(1);
  if (!s || !s.accessTokenHash || !safeEqual(s.accessTokenHash, sha256(token))) return false;
  if (s.resultStorageKey) await storage().delete(s.resultStorageKey);
  await db
    .update(tryonSessions)
    .set({ status: "deleted", resultStorageKey: null, accessTokenHash: null, deletedAt: new Date() })
    .where(eq(tryonSessions.id, s.id));
  return true;
}

async function expireSession(id: string, key: string | null) {
  if (key) await storage().delete(key).catch(() => undefined);
  await db
    .update(tryonSessions)
    .set({ status: "expired", resultStorageKey: null, accessTokenHash: null, deletedAt: new Date() })
    .where(eq(tryonSessions.id, id));
}

/** Deletes every expired try-on result. Runs on a timer and opportunistically on each try-on. */
export async function purgeExpiredTryOns() {
  const expired = await db
    .select({ id: tryonSessions.id, key: tryonSessions.resultStorageKey })
    .from(tryonSessions)
    .where(and(eq(tryonSessions.status, "completed"), or(lt(tryonSessions.expiresAt, new Date()), isNull(tryonSessions.expiresAt))));
  for (const s of expired) await expireSession(s.id, s.key);
  return expired.length;
}
