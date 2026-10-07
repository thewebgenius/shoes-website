import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { product3dAssets, productImages, products } from "../db/schema";
import { storageKeys } from "../storage";
import { can } from "../auth/rbac";
import type { SessionUser } from "../auth/session";

/**
 * Decides whether a media file may be served, and with which cache policy.
 * Published product media is public. Everything else (drafts, raw uploads,
 * cutouts) requires an authenticated admin and is never cached by shared caches.
 */

export type MediaGrant = { key: string; contentType: string; cache: "public" | "private" } | null;

const uuid = z.string().uuid();

export async function authorizeImage(imageId: string, variant: string, user: SessionUser | null): Promise<MediaGrant> {
  if (!uuid.safeParse(imageId).success) return null;
  const [row] = await db
    .select({ img: productImages, status: products.status })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(eq(productImages.id, imageId))
    .limit(1);
  if (!row) return null;
  const isAdmin = can(user?.role, "products:read");

  if (variant === "raw") {
    if (row.img.kind !== "raw" || !isAdmin) return null;
    return { key: row.img.storageKey, contentType: "image/png", cache: "private" };
  }
  if (row.img.kind !== "processed") return null;
  if (variant === "cutout") {
    if (!isAdmin) return null;
    return { key: storageKeys.cutout(row.img.productId, row.img.id), contentType: "image/png", cache: "private" };
  }
  const size = Number(variant);
  if (!(row.img.variants ?? []).includes(size)) return null;
  const isPublic = row.status === "published";
  if (!isPublic && !isAdmin) return null;
  return { key: storageKeys.productImage(row.img.productId, row.img.id, size), contentType: "image/webp", cache: isPublic ? "public" : "private" };
}

export async function authorizeModel(assetId: string, user: SessionUser | null): Promise<MediaGrant> {
  if (!uuid.safeParse(assetId).success) return null;
  const [row] = await db
    .select({ asset: product3dAssets, status: products.status })
    .from(product3dAssets)
    .innerJoin(products, eq(products.id, product3dAssets.productId))
    .where(eq(product3dAssets.id, assetId))
    .limit(1);
  if (!row) return null;
  const isPublic = row.status === "published" && row.asset.isPrimary;
  if (!isPublic && !can(user?.role, "products:read")) return null;
  return { key: row.asset.storageKey, contentType: "model/gltf-binary", cache: isPublic ? "public" : "private" };
}
