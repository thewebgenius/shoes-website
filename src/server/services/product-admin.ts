import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { and, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import {
  aiProcessingJobs,
  product3dAssets,
  productImages,
  products,
  type Product,
  type ProductStatus,
} from "../db/schema";
import { aiProviders } from "../ai/registry";
import { runInBackground } from "../background";
import { toProviderError } from "../ai/errors";
import { withRetry } from "../ai/resilience";
import type { MetadataSuggestion } from "../ai/types";
import { storage, storageKeys } from "../storage";
import { audit } from "../security/audit";
import { inspectGlb, UploadError, type ValidatedImage, type ValidatedModel } from "../security/upload";
import type { SessionUser } from "../auth/session";
import { SAMPLE_MODELS, sampleModelPath } from "./sample-models";

export class WorkflowError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const IMAGE_VARIANTS = [400, 800, 1200] as const;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ""));

export const productInputSchema = z.object({
  name: text(120).pipe(z.string().min(2, "Name is required")),
  category: z.enum(["men", "women", "kids"]),
  gender: z.enum(["male", "female", "unisex"]).default("unisex"),
  shoeType: text(60).nullish().transform((v) => v || null),
  brand: text(60).nullish().transform((v) => v || null),
  color: text(60).nullish().transform((v) => v || null),
  secondaryColors: text(120).nullish().transform((v) => v || null),
  style: text(60).nullish().transform((v) => v || null),
  modelName: text(80).nullish().transform((v) => v || null),
  description: text(2000).nullish().transform((v) => v || null),
  metadataVerified: z.boolean().default(false),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "shoe"
  );
}

async function uniqueSlug(name: string, excludeId?: string) {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await db
      .select({ id: products.id })
      .from(products)
      .where(excludeId ? and(eq(products.slug, candidate), ne(products.id, excludeId)) : eq(products.slug, candidate))
      .limit(1);
    if (!clash.length) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listProductsForAdmin(status?: ProductStatus) {
  return db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      category: products.category,
      status: products.status,
      color: products.color,
      metadataVerified: products.metadataVerified,
      updatedAt: products.updatedAt,
      imageId: sql<string | null>`(select i.id from product_images i where i.product_id = ${products.id} and i.kind = 'processed' and i.is_primary limit 1)`,
      hasModel: sql<boolean>`exists(select 1 from product_3d_assets a where a.product_id = ${products.id} and a.is_primary)`,
    })
    .from(products)
    .where(status ? eq(products.status, status) : ne(products.status, "archived"))
    .orderBy(desc(products.updatedAt));
}

export async function getProductForAdmin(id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) return null;
  await reapStaleJobs(id);
  const images = await db.select().from(productImages).where(eq(productImages.productId, id)).orderBy(desc(productImages.createdAt));
  const models = await db.select().from(product3dAssets).where(eq(product3dAssets.productId, id)).orderBy(desc(product3dAssets.createdAt));
  const jobs = await db.select().from(aiProcessingJobs).where(eq(aiProcessingJobs.productId, id)).orderBy(desc(aiProcessingJobs.createdAt)).limit(20);
  const primaryImage = images.find((i) => i.kind === "processed" && i.isPrimary) ?? null;
  const primaryModel = models.find((m) => m.isPrimary) ?? null;
  return { product, images, models, jobs, primaryImage, primaryModel, readiness: readiness(product, !!primaryImage, !!primaryModel) };
}

export function readiness(p: Product, hasImage: boolean, hasModel: boolean) {
  const missing: string[] = [];
  if (!hasImage) missing.push("a processed product image");
  if (!hasModel) missing.push("a 3D model");
  if (!p.metadataVerified) missing.push("verified metadata");
  if (!p.name || !p.category) missing.push("name and category");
  return { ready: missing.length === 0, missing };
}

async function loadOrThrow(id: string) {
  const data = await getProductForAdmin(id);
  if (!data) throw new WorkflowError("Product not found.", 404);
  return data;
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

export async function createProduct(input: ProductInput, actor: SessionUser) {
  const data = productInputSchema.parse(input);
  const [row] = await db
    .insert(products)
    .values({ ...data, slug: await uniqueSlug(data.name), status: "draft", createdBy: actor.id })
    .returning();
  await audit(actor, "product.create", { type: "product", id: row.id }, { name: row.name, category: row.category });
  return row;
}

export async function updateProduct(id: string, input: ProductInput, actor: SessionUser) {
  const { product } = await loadOrThrow(id);
  if (product.status === "archived") throw new WorkflowError("Restore the product before editing it.");
  const data = productInputSchema.parse(input);
  const changes: Partial<typeof products.$inferInsert> = { ...data };
  if (data.name !== product.name && product.status !== "published") changes.slug = await uniqueSlug(data.name, id);
  // Changing a product that is waiting for approval sends it back to draft so
  // the approver always sees what they approve.
  if (product.status === "pending_review" || product.status === "rejected" || product.status === "approved") changes.status = "draft";
  const [row] = await db.update(products).set(changes).where(eq(products.id, id)).returning();
  const diff = Object.fromEntries(
    Object.entries(data).filter(([k, v]) => (product as Record<string, unknown>)[k] !== v),
  );
  await audit(actor, "product.update", { type: "product", id }, { changed: diff, statusBefore: product.status, statusAfter: row.status });
  return row;
}

// ---------------------------------------------------------------------------
// Status workflow
// ---------------------------------------------------------------------------

/**
 * Lifecycle: draft → (photo processing → AI ready) → pending_review ("Needs review")
 * → approved → published. Approving and publishing are separate, deliberate
 * steps; nothing is ever published automatically.
 */
export type Transition = "submit" | "approve" | "publish" | "reject" | "unpublish" | "archive" | "restore" | "edit";

const ALLOWED: Record<Transition, ProductStatus[]> = {
  submit: ["draft", "rejected", "unpublished"],
  approve: ["pending_review"],
  publish: ["approved"],
  reject: ["pending_review", "approved"],
  unpublish: ["published"],
  archive: ["draft", "pending_review", "approved", "rejected", "unpublished", "published"],
  restore: ["archived"],
  edit: ["pending_review", "approved", "rejected", "unpublished"],
};

export async function transition(id: string, action: Transition, actor: SessionUser, opts: { reason?: string } = {}) {
  const { product, readiness: ready } = await loadOrThrow(id);
  if (!ALLOWED[action].includes(product.status)) {
    throw new WorkflowError(`Cannot ${action} a product that is ${product.status.replace("_", " ")}.`, 409);
  }
  let changes: Partial<typeof products.$inferInsert> = {};
  switch (action) {
    case "submit":
      if (!ready.ready) throw new WorkflowError(`Before submitting, add ${ready.missing.join(", ")}.`);
      changes = { status: "pending_review", rejectionReason: null };
      break;
    case "approve":
      if (!ready.ready) throw new WorkflowError(`Cannot approve yet: missing ${ready.missing.join(", ")}.`);
      changes = { status: "approved", rejectionReason: null };
      break;
    case "publish":
      if (!ready.ready) throw new WorkflowError(`Cannot publish yet: missing ${ready.missing.join(", ")}.`);
      changes = { status: "published", publishedAt: new Date(), publishedBy: actor.id, rejectionReason: null };
      break;
    case "reject": {
      const reason = (opts.reason ?? "").trim().slice(0, 500);
      if (reason.length < 3) throw new WorkflowError("Please give a short reason for rejecting.");
      changes = { status: "rejected", rejectionReason: reason };
      break;
    }
    case "unpublish":
      changes = { status: "unpublished" };
      break;
    case "archive":
      changes = { status: "archived" };
      break;
    case "restore":
    case "edit":
      changes = { status: "draft" };
      break;
  }
  const [row] = await db.update(products).set(changes).where(eq(products.id, id)).returning();
  await audit(actor, `product.${action}`, { type: "product", id }, { from: product.status, to: row.status, reason: opts.reason });
  return row;
}

// ---------------------------------------------------------------------------
// Image pipeline: raw photo → background removal → enhancement → crop/resize
// ---------------------------------------------------------------------------

async function storeProcessed(productId: string, imageId: string, processed: Buffer) {
  for (const v of IMAGE_VARIANTS) {
    const buf = await sharp(processed).resize(v, v, { fit: "inside" }).webp({ quality: v >= 1200 ? 84 : 80 }).toBuffer();
    await storage().put(storageKeys.productImage(productId, imageId, v), buf);
  }
}

export type ProcessOutcome =
  | { ok: true; queued: true; jobId: string; rawImageId: string }
  | { ok: true; duplicate: true; rawImageId: string; message: string }
  | { ok: false; notConfigured?: boolean; error: string; rawImageId: string };

/** Jobs still "active" after this long were interrupted (e.g. a server restart). */
const STALE_JOB_MINUTES = 15;
const ACTIVE: Array<"queued" | "running" | "retrying"> = ["queued", "running", "retrying"];

export async function reapStaleJobs(productId: string) {
  await db
    .update(aiProcessingJobs)
    .set({ status: "failed", error: "Interrupted before it finished (the server restarted). Use Retry processing.", finishedAt: new Date() })
    .where(
      and(
        eq(aiProcessingJobs.productId, productId),
        inArray(aiProcessingJobs.status, ACTIVE),
        lt(aiProcessingJobs.createdAt, new Date(Date.now() - STALE_JOB_MINUTES * 60_000)),
      ),
    );
}

export async function uploadAndProcessRawImage(productId: string, image: ValidatedImage, actor: SessionUser): Promise<ProcessOutcome> {
  const { product } = await loadOrThrow(productId);
  if (product.status === "archived") throw new WorkflowError("Restore the product before uploading images.");

  // Cost control: the same photo is never stored or sent to the AI provider twice for one shoe.
  const contentHash = createHash("sha256").update(image.buffer).digest("hex");
  const [dupe] = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(and(eq(productImages.productId, productId), eq(productImages.kind, "raw"), eq(productImages.contentHash, contentHash)))
    .limit(1);
  if (dupe) {
    return { ok: true, duplicate: true, rawImageId: dupe.id, message: "This photo is already uploaded for this shoe, so it was not processed or charged again. Use Retry processing on it if needed." };
  }

  const [raw] = await db
    .insert(productImages)
    .values({
      productId,
      kind: "raw",
      storageKey: "pending",
      contentHash,
      mimeType: image.mime,
      width: image.width,
      height: image.height,
      bytes: image.buffer.length,
    })
    .returning();
  // The original is stored privately under its own key and never overwritten.
  const rawKey = storageKeys.rawImage(productId, raw.id);
  await storage().put(rawKey, image.buffer);
  await db.update(productImages).set({ storageKey: rawKey }).where(eq(productImages.id, raw.id));
  await audit(actor, "product.image.upload_raw", { type: "product", id: productId }, { imageId: raw.id, bytes: image.buffer.length });

  return processRawImage(productId, raw.id, actor);
}

/**
 * Queues (or re-queues) AI processing of a stored raw photo and returns at
 * once. The job record carries the status the admin page shows:
 * queued → running → (retrying) → succeeded | needs_review | failed | unavailable.
 */
export async function processRawImage(productId: string, rawImageId: string, actor: SessionUser): Promise<ProcessOutcome> {
  const provider = aiProviders().imageEnhancement;
  const [raw] = await db
    .select()
    .from(productImages)
    .where(and(eq(productImages.id, rawImageId), eq(productImages.productId, productId), eq(productImages.kind, "raw")))
    .limit(1);
  if (!raw) throw new WorkflowError("Raw image not found.", 404);

  await reapStaleJobs(productId);
  const [active] = await db
    .select({ id: aiProcessingJobs.id })
    .from(aiProcessingJobs)
    .where(and(eq(aiProcessingJobs.inputImageId, raw.id), eq(aiProcessingJobs.type, "image_enhancement"), inArray(aiProcessingJobs.status, ACTIVE)))
    .limit(1);
  if (active) throw new WorkflowError("This photo is already being processed.", 409);

  if (!provider.configured) {
    await db.insert(aiProcessingJobs).values({
      type: "image_enhancement",
      status: "unavailable",
      productId,
      inputImageId: raw.id,
      provider: provider.id,
      isMock: provider.isMock,
      createdBy: actor.id,
      error: `AI provider not configured. ${provider.notConfiguredReason ?? ""}`.trim(),
      finishedAt: new Date(),
    });
    return { ok: false, notConfigured: true, error: "AI provider not configured. The original photo is saved; processing will work once a provider is set up.", rawImageId: raw.id };
  }

  const [job] = await db
    .insert(aiProcessingJobs)
    .values({ type: "image_enhancement", status: "queued", productId, inputImageId: raw.id, provider: provider.id, isMock: provider.isMock, createdBy: actor.id })
    .returning();
  runInBackground(() => runImageJob(job.id, productId, raw.id, raw.storageKey, actor));
  return { ok: true, queued: true, jobId: job.id, rawImageId: raw.id };
}

async function runImageJob(jobId: string, productId: string, rawImageId: string, rawKey: string, actor: SessionUser) {
  const provider = aiProviders().imageEnhancement;
  const setJob = (v: Partial<typeof aiProcessingJobs.$inferInsert>) => db.update(aiProcessingJobs).set(v).where(eq(aiProcessingJobs.id, jobId));
  await setJob({ status: "running", startedAt: new Date(), attempts: 1 });
  try {
    const input = await storage().get(rawKey);
    const result = await withRetry("image_enhancement", provider.id, () => provider.enhance(input), {
      onRetry: async (attempt, e) => {
        await setJob({ status: "retrying", attempts: attempt + 1, error: e.userMessage });
      },
    });
    await setJob({ status: "running", error: null });
    const meta = await sharp(result.processed).metadata();
    const [processed] = await db
      .insert(productImages)
      .values({
        productId,
        kind: "processed",
        sourceImageId: rawImageId,
        storageKey: storageKeys.productImage(productId, "pending", 1200),
        mimeType: "image/webp",
        width: meta.width ?? 1200,
        height: meta.height ?? 1200,
        bytes: result.processed.length,
        variants: [...IMAGE_VARIANTS],
        processingProvider: provider.id,
      })
      .returning();
    await storeProcessed(productId, processed.id, result.processed);
    await storage().put(storageKeys.cutout(productId, processed.id), result.cutout);
    await db
      .update(productImages)
      .set({ storageKey: storageKeys.productImage(productId, processed.id, 1200) })
      .where(eq(productImages.id, processed.id));
    await setPrimaryImage(productId, processed.id);
    await setJob({ status: "succeeded", outputImageId: processed.id, finishedAt: new Date(), result: { steps: result.steps, warnings: result.warnings } });

    // Follow-on jobs. Their failure never undoes the processed image.
    await embedImage(productId, processed.id, result.cutout, actor).catch(() => undefined);
    const suggestion = await suggestMetadata(productId, result.cutout, actor, input);

    // The vision model also checks the cutout against the original photo.
    const issues = suggestion?.cutoutIssues ?? [];
    const warnings = [...result.warnings, ...issues.map((i) => `AI check: ${i}`)];
    if (warnings.length) {
      await setJob({ status: "needs_review", result: { steps: result.steps, warnings } });
    }
  } catch (raw) {
    const e = toProviderError(provider.id, raw);
    await setJob({ status: e.code === "not_configured" ? "unavailable" : "failed", error: e.message.slice(0, 500), finishedAt: new Date() });
  }
}

export async function setPrimaryImage(productId: string, imageId: string) {
  await db.transaction(async (tx) => {
    await tx.update(productImages).set({ isPrimary: false }).where(and(eq(productImages.productId, productId), eq(productImages.kind, "processed")));
    await tx
      .update(productImages)
      .set({ isPrimary: true })
      .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId), eq(productImages.kind, "processed")));
  });
}

export async function embedImage(productId: string, imageId: string, cutout: Buffer, actor: SessionUser | null) {
  const provider = aiProviders().embedding;
  const [job] = await db
    .insert(aiProcessingJobs)
    .values({ type: "embedding", status: "running", productId, inputImageId: imageId, provider: provider.id, isMock: provider.isMock, createdBy: actor?.id, startedAt: new Date(), attempts: 1 })
    .returning();
  try {
    const vector = await provider.embed(cutout);
    await db.update(productImages).set({ embedding: vector, embeddingModel: provider.model }).where(eq(productImages.id, imageId));
    await db.update(aiProcessingJobs).set({ status: "succeeded", finishedAt: new Date() }).where(eq(aiProcessingJobs.id, job.id));
  } catch (raw) {
    const e = toProviderError(provider.id, raw);
    await db.update(aiProcessingJobs).set({ status: "failed", error: e.message.slice(0, 500), finishedAt: new Date() }).where(eq(aiProcessingJobs.id, job.id));
    throw e;
  }
}

/**
 * Asks the metadata provider for suggestions and stores them for the
 * shopkeeper to review. Returns null when not configured or on failure (both
 * recorded as jobs); never throws, never publishes.
 */
export async function suggestMetadata(productId: string, cutout: Buffer, actor: SessionUser, original?: Buffer): Promise<MetadataSuggestion | null> {
  const provider = aiProviders().metadata;
  if (!provider.configured) {
    await db.insert(aiProcessingJobs).values({
      type: "metadata_suggestion",
      status: "unavailable",
      productId,
      provider: provider.id,
      isMock: provider.isMock,
      createdBy: actor.id,
      error: `AI provider not configured. ${provider.notConfiguredReason ?? ""}`.trim(),
      finishedAt: new Date(),
    });
    return null;
  }
  const [job] = await db
    .insert(aiProcessingJobs)
    .values({ type: "metadata_suggestion", status: "running", productId, provider: provider.id, isMock: provider.isMock, createdBy: actor.id, startedAt: new Date(), attempts: 1 })
    .returning();
  try {
    const suggestion = await withRetry("metadata", provider.id, () => provider.suggest({ cutout, original }), {
      onRetry: async (attempt, e) => {
        await db.update(aiProcessingJobs).set({ status: "retrying", attempts: attempt + 1, error: e.userMessage }).where(eq(aiProcessingJobs.id, job.id));
      },
    });
    await db
      .update(products)
      .set({ aiSuggestions: { ...suggestion, provider: provider.label, providerKind: provider.kind, isMock: provider.isMock, at: new Date().toISOString() } })
      .where(eq(products.id, productId));
    await db.update(aiProcessingJobs).set({ status: "succeeded", error: null, result: suggestion, finishedAt: new Date() }).where(eq(aiProcessingJobs.id, job.id));
    return suggestion;
  } catch (raw) {
    const e = toProviderError(provider.id, raw);
    await db
      .update(aiProcessingJobs)
      .set({ status: e.code === "not_configured" ? "unavailable" : "failed", error: e.message.slice(0, 500), finishedAt: new Date() })
      .where(eq(aiProcessingJobs.id, job.id));
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3D models
// ---------------------------------------------------------------------------

async function addModel(
  productId: string,
  buffer: Buffer,
  meta: { source: "admin_upload" | "ai_generated" | "sample_library"; fileName: string; triangleCount: number; provider?: string; license?: string; attribution?: string },
  actor: SessionUser,
) {
  const [asset] = await db
    .insert(product3dAssets)
    .values({
      productId,
      source: meta.source,
      storageKey: "pending",
      fileName: meta.fileName.slice(0, 200),
      bytes: buffer.length,
      format: "glb",
      triangleCount: meta.triangleCount,
      provider: meta.provider,
      license: meta.license,
      attribution: meta.attribution,
      createdBy: actor.id,
    })
    .returning();
  const key = storageKeys.model(productId, asset.id);
  await storage().put(key, buffer);
  await db.transaction(async (tx) => {
    await tx.update(product3dAssets).set({ isPrimary: false }).where(eq(product3dAssets.productId, productId));
    await tx.update(product3dAssets).set({ storageKey: key, isPrimary: true }).where(eq(product3dAssets.id, asset.id));
  });
  await audit(actor, `product.model.${meta.source}`, { type: "product", id: productId }, { assetId: asset.id, fileName: meta.fileName, bytes: buffer.length });
  return asset;
}

export async function uploadModel(productId: string, model: ValidatedModel, fileName: string, actor: SessionUser) {
  const { product } = await loadOrThrow(productId);
  if (product.status === "archived") throw new WorkflowError("Restore the product before uploading a model.");
  return addModel(productId, model.buffer, { source: "admin_upload", fileName, triangleCount: model.triangleCount, license: "Provided by the store" }, actor);
}

export async function assignSampleModel(productId: string, sampleId: string, actor: SessionUser) {
  const sample = SAMPLE_MODELS.find((s) => s.id === sampleId);
  if (!sample) throw new WorkflowError("Unknown sample model.");
  await loadOrThrow(productId);
  const buffer = await fs.readFile(sampleModelPath(sample.id));
  const info = await inspectGlb(buffer).catch((e) => {
    throw new WorkflowError(e instanceof UploadError ? e.message : "Sample model is unreadable.");
  });
  return addModel(
    productId,
    buffer,
    { source: "sample_library", fileName: path.basename(sampleModelPath(sample.id)), triangleCount: info.triangleCount, license: sample.license, attribution: sample.attribution },
    actor,
  );
}

/** Phase 2 integration point. With the default provider this records an "unavailable" job and explains why. */
export async function requestGeneratedModel(productId: string, actor: SessionUser) {
  const { images, product } = await loadOrThrow(productId);
  const provider = aiProviders().threeD;
  const [job] = await db
    .insert(aiProcessingJobs)
    .values({ type: "three_d_generation", status: "running", productId, provider: provider.id, isMock: provider.isMock, createdBy: actor.id, startedAt: new Date() })
    .returning();
  if (!provider.available) {
    await db
      .update(aiProcessingJobs)
      .set({ status: "unavailable", error: provider.unavailableReason, finishedAt: new Date() })
      .where(eq(aiProcessingJobs.id, job.id));
    return { ok: false as const, error: provider.unavailableReason ?? "3D generation is not available." };
  }
  try {
    const sources = await Promise.all(images.filter((i) => i.kind === "raw").slice(0, 4).map((i) => storage().get(i.storageKey)));
    if (!sources.length) throw new WorkflowError("Upload at least one photo first.");
    const result = await provider.generate({ images: sources, productName: product.name });
    const info = await inspectGlb(result.glb);
    const asset = await addModel(
      productId,
      result.glb,
      { source: "ai_generated", fileName: `${product.slug}-generated.glb`, triangleCount: info.triangleCount, provider: provider.id, license: "Generated" },
      actor,
    );
    await db.update(aiProcessingJobs).set({ status: "succeeded", finishedAt: new Date(), result: { assetId: asset.id } }).where(eq(aiProcessingJobs.id, job.id));
    return { ok: true as const };
  } catch (e) {
    await db
      .update(aiProcessingJobs)
      .set({ status: "failed", error: String((e as Error).message).slice(0, 500), finishedAt: new Date() })
      .where(eq(aiProcessingJobs.id, job.id));
    return { ok: false as const, error: "3D generation failed. Upload a model instead." };
  }
}
