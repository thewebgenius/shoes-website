import "server-only";
import sharp from "sharp";
import { and, desc, eq, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { productImages, products, tryonPhotos, tryonSessions } from "../db/schema";
import { aiProviders } from "../ai/registry";
import { toProviderError, type ProviderErrorCode } from "../ai/errors";
import { DEFAULT_PLACEMENT } from "../ai/types";
import { runInBackground } from "../background";
import { env } from "../env";
import { decryptBuffer, encryptBuffer, randomToken, safeEqual, sha256 } from "../security/crypto";
import { storage, storageKeys } from "../storage";
import type { ValidatedImage } from "../security/upload";
import { track } from "./analytics";

/**
 * Virtual try-on.
 *
 * Flow: the customer uploads a photo once (savePhoto), then generates a
 * preview for any shoe (startTryOn), as many times as they like during the
 * visit, without uploading again. Generation runs in the background; the page
 * polls getTryOnStatus.
 *
 * Privacy:
 *  - The photo is re-encoded (no EXIF/GPS), encrypted at rest (AES-256-GCM)
 *    under a random file name, and readable only with the token in the
 *    visitor's HttpOnly cookie. It is never public, never logged, never used
 *    for training, and is deleted at expiry (TRYON_RESULT_TTL_MINUTES) or when
 *    the customer deletes it.
 *  - It is sent to the try-on provider in the request body (base64), never as a URL.
 *  - Previews are stored the same way and deleted with the photo.
 */

export const PHOTO_COOKIE = "tryon_photo";

/** Customer-facing wording for provider failures (the admin sees the detailed reason in logs). */
const CUSTOMER_MESSAGES: Partial<Record<ProviderErrorCode, string>> = {
  not_configured: "AI provider not configured. Virtual try-on isn't available yet.",
  auth: "Virtual try-on is temporarily unavailable (provider configuration problem). Please try again later.",
  quota: "Virtual try-on is temporarily unavailable. Please try again later.",
  rate_limited: "The try-on service is busy. Please try again in a minute.",
  invalid_input: "The AI couldn't use this photo. Try a well-lit photo where your feet and shoes are clearly visible.",
  content_rejected: "This photo can't be used for try-on. Please choose a different photo.",
  timeout: "The preview took too long. Please try again.",
};
const customerMessage = (code: ProviderErrorCode) => CUSTOMER_MESSAGES[code] ?? "We couldn't generate a preview this time. Please try again.";

const placementSchema = z.object({
  x: z.coerce.number().min(0).max(1).catch(DEFAULT_PLACEMENT.x),
  y: z.coerce.number().min(0).max(1).catch(DEFAULT_PLACEMENT.y),
  scale: z.coerce.number().min(0.08).max(1).catch(DEFAULT_PLACEMENT.scale),
});

const ACTIVE = ["queued", "processing", "retrying"] as const;
const PHOTO_MAX_EDGE = 2048;
const STALE_MINUTES = 10;

// ---------------------------------------------------------------------------
// Photo
// ---------------------------------------------------------------------------

/** Cookie value is `<photoId>.<token>`; only the token's hash is stored. */
export function parsePhotoCookie(value: string | undefined) {
  const [id, token] = (value ?? "").split(".");
  if (!id || !token || !z.string().uuid().safeParse(id).success || token.length > 100) return null;
  return { id, token };
}

export async function savePhoto(photo: ValidatedImage, ipHash: string) {
  try {
    // Compress once here: the provider never needs more than ~2K pixels.
    const jpeg = await sharp(photo.buffer).rotate().resize({ width: PHOTO_MAX_EDGE, height: PHOTO_MAX_EDGE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
    const token = randomToken(24);
    const key = storageKeys.tryonPhoto(randomToken(18).replace(/[^a-z0-9]/gi, "x"));
    await storage().put(key, encryptBuffer(jpeg.data));
    const expiresAt = new Date(Date.now() + env().TRYON_RESULT_TTL_MINUTES * 60_000);
    const [row] = await db
      .insert(tryonPhotos)
      .values({ storageKey: key, accessTokenHash: sha256(token), width: jpeg.info.width, height: jpeg.info.height, ipHash, expiresAt })
      .returning({ id: tryonPhotos.id });
    jpeg.data.fill(0);
    return { photoId: row.id, token, expiresAt, width: jpeg.info.width, height: jpeg.info.height };
  } finally {
    photo.buffer.fill(0);
  }
}

async function authorisedPhoto(photoId: string, token: string) {
  const [p] = await db.select().from(tryonPhotos).where(eq(tryonPhotos.id, photoId)).limit(1);
  if (!p || !p.accessTokenHash || !p.storageKey || p.deletedAt) return null;
  if (!safeEqual(p.accessTokenHash, sha256(token))) return null;
  if (p.expiresAt < new Date()) {
    await deletePhotoRow(p.id);
    return null;
  }
  return p;
}

/** Deletes the photo and every preview made from it. */
async function deletePhotoRow(photoId: string) {
  const [p] = await db.select().from(tryonPhotos).where(eq(tryonPhotos.id, photoId)).limit(1);
  if (p?.storageKey) await storage().delete(p.storageKey).catch(() => undefined);
  await db.update(tryonPhotos).set({ storageKey: null, accessTokenHash: null, deletedAt: new Date() }).where(eq(tryonPhotos.id, photoId));
  const sessions = await db.select({ id: tryonSessions.id, key: tryonSessions.resultStorageKey }).from(tryonSessions).where(eq(tryonSessions.photoId, photoId));
  for (const s of sessions) {
    if (s.key) await storage().delete(s.key).catch(() => undefined);
  }
  await db
    .update(tryonSessions)
    .set({ status: "deleted", resultStorageKey: null, accessTokenHash: null, deletedAt: new Date() })
    .where(and(eq(tryonSessions.photoId, photoId), ne(tryonSessions.status, "failed")));
}

export async function deletePhoto(photoId: string, token: string) {
  const p = await authorisedPhoto(photoId, token);
  if (!p) return false;
  await deletePhotoRow(p.id);
  return true;
}

/** The owner's own photo, for showing it again after a page reload. */
export async function readPhoto(photoId: string, token: string) {
  const p = await authorisedPhoto(photoId, token);
  if (!p?.storageKey) return null;
  const data = await storage().get(p.storageKey).catch(() => null);
  return data ? decryptBuffer(data) : null;
}

export async function photoInfo(photoId: string, token: string) {
  const p = await authorisedPhoto(photoId, token);
  return p ? { photoId: p.id, expiresAt: p.expiresAt, width: p.width, height: p.height } : null;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export type StartOutcome =
  | { ok: true; sessionId: string; status: string; reused: boolean }
  | { ok: false; error: string; status: number; notConfigured?: boolean };

/** Starts a preview. Runs only on an explicit request; identical requests reuse the earlier result. */
export async function startTryOn(opts: { photoId: string; token: string; productId: string; ipHash: string; placement?: unknown }): Promise<StartOutcome> {
  const provider = aiProviders().tryOn;
  if (!provider.configured) return { ok: false, error: customerMessage("not_configured"), status: 503, notConfigured: true };
  if (!z.string().uuid().safeParse(opts.productId).success) return { ok: false, error: "Choose a shoe from the catalogue.", status: 400 };
  const photo = await authorisedPhoto(opts.photoId, opts.token);
  if (!photo) return { ok: false, error: "Your photo has expired or was deleted. Please upload it again.", status: 410 };
  const [row] = await db
    .select({ p: products, img: productImages })
    .from(products)
    .innerJoin(productImages, and(eq(productImages.productId, products.id), eq(productImages.kind, "processed"), eq(productImages.isPrimary, true)))
    .where(and(eq(products.id, opts.productId), eq(products.status, "published")))
    .limit(1);
  if (!row) return { ok: false, error: "That shoe is not available for try-on.", status: 404 };

  await failStaleSessions();
  const placement = placementSchema.parse(opts.placement ?? DEFAULT_PLACEMENT);

  // Cost control: the same photo + shoe with a real model is generated once per visit.
  if (!provider.usesPlacement) {
    const [existing] = await db
      .select()
      .from(tryonSessions)
      .where(
        and(
          eq(tryonSessions.photoId, photo.id),
          eq(tryonSessions.productId, row.p.id),
          eq(tryonSessions.provider, provider.id),
          inArray(tryonSessions.status, [...ACTIVE, "completed"]),
        ),
      )
      .orderBy(desc(tryonSessions.createdAt))
      .limit(1);
    if (existing && (existing.status !== "completed" || (existing.expiresAt && existing.expiresAt > new Date()))) {
      return { ok: true, sessionId: existing.id, status: existing.status, reused: true };
    }
  }

  const [session] = await db
    .insert(tryonSessions)
    .values({ photoId: photo.id, productId: row.p.id, provider: provider.id, isMock: provider.isMock, status: "queued", ipHash: opts.ipHash })
    .returning();
  await track("tryon_start", { productId: row.p.id, visitorHash: opts.ipHash, metadata: { provider: provider.id } });
  runInBackground(() => runTryOnJob(session.id, photo.storageKey!, { productId: row.p.id, imageId: row.img.id, name: row.p.name }, placement, opts.ipHash));
  return { ok: true, sessionId: session.id, status: "queued", reused: false };
}

async function runTryOnJob(
  sessionId: string,
  photoKey: string,
  product: { productId: string; imageId: string; name: string },
  placement: z.infer<typeof placementSchema>,
  ipHash: string,
) {
  const provider = aiProviders().tryOn;
  const started = Date.now();
  const set = (v: Partial<typeof tryonSessions.$inferInsert>) => db.update(tryonSessions).set(v).where(eq(tryonSessions.id, sessionId));
  await set({ status: "processing", attempts: 1 });
  let personImage: Buffer | null = null;
  try {
    personImage = decryptBuffer(await storage().get(photoKey));
    const productImage = await storage().get(storageKeys.cutout(product.productId, product.imageId));
    const { image } = await provider.tryOn(
      { personImage, productImage, productName: product.name, placement },
      { onRetry: (attempt) => set({ status: "retrying", attempts: attempt + 1 }).then(() => undefined) },
    );
    const key = storageKeys.tryonResult(sessionId);
    await storage().put(key, encryptBuffer(image));
    const expiresAt = new Date(Date.now() + env().TRYON_RESULT_TTL_MINUTES * 60_000);
    await set({ status: "completed", resultStorageKey: key, expiresAt, durationMs: Date.now() - started, error: null });
    await track("tryon_complete", { productId: product.productId, visitorHash: ipHash, metadata: { provider: provider.id } });
  } catch (raw) {
    const e = toProviderError(provider.id, raw);
    // Stored error is the structured code only; no image data, no keys.
    await set({ status: "failed", error: e.code, durationMs: Date.now() - started });
  } finally {
    personImage?.fill(0);
    personImage = null;
  }
}

async function failStaleSessions() {
  await db
    .update(tryonSessions)
    .set({ status: "failed", error: "timeout" })
    .where(and(inArray(tryonSessions.status, [...ACTIVE]), lt(tryonSessions.createdAt, new Date(Date.now() - STALE_MINUTES * 60_000))));
}

async function authorisedSession(sessionId: string, photoCookie: string | undefined) {
  const c = parsePhotoCookie(photoCookie);
  if (!c || !z.string().uuid().safeParse(sessionId).success) return null;
  const photo = await authorisedPhoto(c.id, c.token);
  if (!photo) return null;
  const [s] = await db.select().from(tryonSessions).where(and(eq(tryonSessions.id, sessionId), eq(tryonSessions.photoId, photo.id))).limit(1);
  return s ?? null;
}

export type TryOnStatus =
  | { status: "queued" | "processing" | "retrying"; attempts: number }
  | { status: "completed"; expiresAt: string; isMock: boolean; providerLabel: string }
  | { status: "failed"; error: string; retryable: boolean }
  | { status: "gone" };

export async function getTryOnStatus(sessionId: string, photoCookie: string | undefined): Promise<TryOnStatus | null> {
  const s = await authorisedSession(sessionId, photoCookie);
  if (!s) return null;
  if (s.status === "completed") {
    if (!s.expiresAt || s.expiresAt < new Date()) {
      await expireSession(s.id, s.resultStorageKey);
      return { status: "gone" };
    }
    const provider = aiProviders().tryOn;
    return { status: "completed", expiresAt: s.expiresAt.toISOString(), isMock: s.isMock, providerLabel: s.provider === provider.id ? provider.label : s.provider };
  }
  if (s.status === "failed") {
    const code = (s.error ?? "upstream") as ProviderErrorCode;
    return { status: "failed", error: customerMessage(code), retryable: !["not_configured", "auth", "quota", "content_rejected"].includes(code) };
  }
  if (s.status === "queued" || s.status === "processing" || s.status === "retrying") return { status: s.status, attempts: s.attempts };
  return { status: "gone" };
}

export async function readTryOnResult(sessionId: string, photoCookie: string | undefined) {
  const s = await authorisedSession(sessionId, photoCookie);
  if (!s || s.status !== "completed" || !s.resultStorageKey) return null;
  if (!s.expiresAt || s.expiresAt < new Date()) {
    await expireSession(s.id, s.resultStorageKey);
    return null;
  }
  const data = await storage().get(s.resultStorageKey).catch(() => null);
  return data ? decryptBuffer(data) : null;
}

export async function deleteTryOnResult(sessionId: string, photoCookie: string | undefined) {
  const s = await authorisedSession(sessionId, photoCookie);
  if (!s) return false;
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

/** Deletes every expired photo and preview. Runs on a timer and on each try-on request. */
export async function purgeExpiredTryOns() {
  const now = new Date();
  const photos = await db
    .select({ id: tryonPhotos.id })
    .from(tryonPhotos)
    .where(and(isNull(tryonPhotos.deletedAt), lt(tryonPhotos.expiresAt, now)));
  for (const p of photos) await deletePhotoRow(p.id);
  const expired = await db
    .select({ id: tryonSessions.id, key: tryonSessions.resultStorageKey })
    .from(tryonSessions)
    .where(and(eq(tryonSessions.status, "completed"), or(lt(tryonSessions.expiresAt, now), isNull(tryonSessions.expiresAt))));
  for (const s of expired) await expireSession(s.id, s.key);
  return photos.length + expired.length;
}
