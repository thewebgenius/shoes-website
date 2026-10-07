import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/** Dimension of visual-search embeddings. Real providers must return vectors of this size. */
export const EMBEDDING_DIM = 512;

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["admin", "shopkeeper"]);
export const productCategory = pgEnum("product_category", ["men", "women", "kids"]);
export const productGender = pgEnum("product_gender", ["male", "female", "unisex"]);
export const productStatus = pgEnum("product_status", [
  "draft",
  "pending_review",
  "approved",
  "published",
  "rejected",
  "unpublished",
  "archived",
]);
export const imageKind = pgEnum("image_kind", ["raw", "processed", "cutout"]);
export const modelSource = pgEnum("model_source", ["admin_upload", "ai_generated", "sample_library"]);
export const reviewStatus = pgEnum("review_status", ["pending", "approved", "rejected", "spam"]);
export const jobType = pgEnum("ai_job_type", ["image_enhancement", "metadata_suggestion", "three_d_generation", "embedding"]);
/**
 * "running" is shown as Processing and "succeeded" as Completed. "unavailable"
 * means the provider is not configured; "needs_review" means the AI finished
 * but flagged something a person must check.
 */
export const jobStatus = pgEnum("ai_job_status", ["queued", "running", "retrying", "succeeded", "needs_review", "failed", "unavailable"]);
export const tryonStatus = pgEnum("tryon_status", ["queued", "processing", "retrying", "completed", "failed", "expired", "deleted"]);
export const analyticsEventType = pgEnum("analytics_event_type", [
  "product_view",
  "model_interaction",
  "tryon_start",
  "tryon_complete",
  "visual_search",
  "review_submit",
]);

// ---------------------------------------------------------------------------
// Users & sessions
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("shopkeeper"),
  isActive: boolean("is_active").notNull().default(true),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...timestamps,
});

/** Server-side sessions so logins can be revoked. Only a SHA-256 hash of the cookie token is stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256(token)
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: productCategory("category").notNull(),
    gender: productGender("gender").notNull().default("unisex"),
    shoeType: text("shoe_type"),
    brand: text("brand"),
    color: text("color"),
    /** Other visible colours, comma separated. */
    secondaryColors: text("secondary_colors"),
    style: text("style"),
    /** Manufacturer model name, only when the shopkeeper confirms it. */
    modelName: text("model_name"),
    description: text("description"),
    status: productStatus("status").notNull().default("draft"),
    /** True once a person confirmed the (possibly AI-suggested) metadata. */
    metadataVerified: boolean("metadata_verified").notNull().default(false),
    /** Last AI metadata suggestion, kept for transparency; never shown publicly. */
    aiSuggestions: jsonb("ai_suggestions"),
    rejectionReason: text("rejection_reason"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("products_status_category_idx").on(t.status, t.category)],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    kind: imageKind("kind").notNull(),
    /** For processed/cutout images: the raw upload they were derived from. */
    sourceImageId: uuid("source_image_id"),
    storageKey: text("storage_key").notNull(),
    /** SHA-256 of the uploaded bytes, so the same photo is never processed (and billed) twice. */
    contentHash: text("content_hash"),
    mimeType: text("mime_type").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    /** Responsive variants that exist for processed images, e.g. [400, 800, 1200]. */
    variants: jsonb("variants").$type<number[]>(),
    isPrimary: boolean("is_primary").notNull().default(false),
    altText: text("alt_text"),
    processingProvider: text("processing_provider"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
    embeddingModel: text("embedding_model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_images_product_idx").on(t.productId),
    index("product_images_hash_idx").on(t.productId, t.contentHash),
    index("product_images_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const product3dAssets = pgTable(
  "product_3d_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    source: modelSource("source").notNull(),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    bytes: integer("bytes").notNull(),
    format: text("format").notNull().default("glb"),
    triangleCount: integer("triangle_count"),
    provider: text("provider"),
    license: text("license"),
    attribution: text("attribution"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("product_3d_assets_product_idx").on(t.productId)],
);

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    displayName: text("display_name").notNull(),
    body: text("body").notNull(),
    status: reviewStatus("status").notNull().default("pending"),
    moderationFlags: jsonb("moderation_flags").$type<string[]>().notNull().default([]),
    ipHash: text("ip_hash"),
    helpfulCount: integer("helpful_count").notNull().default(0),
    moderatedBy: uuid("moderated_by").references(() => users.id, { onDelete: "set null" }),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reviews_product_status_idx").on(t.productId, t.status),
    check("reviews_rating_range", sql`${t.rating} between 1 and 5`),
  ],
);

export const reviewVotes = pgTable(
  "review_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    voterHash: text("voter_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("review_votes_unique").on(t.reviewId, t.voterHash)],
);

// ---------------------------------------------------------------------------
// AI jobs, try-on, visual search
// ---------------------------------------------------------------------------

export const aiProcessingJobs = pgTable(
  "ai_processing_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: jobType("type").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    inputImageId: uuid("input_image_id"),
    outputImageId: uuid("output_image_id"),
    provider: text("provider").notNull(),
    isMock: boolean("is_mock").notNull().default(false),
    attempts: integer("attempts").notNull().default(0),
    result: jsonb("result"),
    error: text("error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_jobs_product_idx").on(t.productId)],
);

/**
 * A customer photo kept for one try-on visit so they can try several shoes
 * without uploading again. Encrypted at rest under a random key, readable only
 * with the token in the visitor's HttpOnly cookie, and deleted at expiresAt.
 */
export const tryonPhotos = pgTable(
  "tryon_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageKey: text("storage_key"),
    accessTokenHash: text("access_token_hash"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    ipHash: text("ip_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tryon_photos_expires_idx").on(t.expiresAt)],
);

/** One row per try-on generation. */
export const tryonSessions = pgTable(
  "tryon_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    photoId: uuid("photo_id").references(() => tryonPhotos.id, { onDelete: "set null" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    status: tryonStatus("status").notNull().default("processing"),
    provider: text("provider").notNull(),
    isMock: boolean("is_mock").notNull().default(false),
    /** Private, temporary result file; removed after expiry. */
    resultStorageKey: text("result_storage_key"),
    accessTokenHash: text("access_token_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    ipHash: text("ip_hash"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tryon_expires_idx").on(t.expiresAt), index("tryon_photo_product_idx").on(t.photoId, t.productId)],
);

/** One row per visual search. The uploaded photo is never stored. */
export const visualSearchSessions = pgTable("visual_search_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: text("status").notNull(),
  provider: text("provider").notNull(),
  results: jsonb("results").$type<Array<{ productId: string; score: number }>>().notNull().default([]),
  topProductId: uuid("top_product_id").references(() => products.id, { onDelete: "set null" }),
  ipHash: text("ip_hash"),
  durationMs: integer("duration_ms"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Analytics, audit, rate limiting
// ---------------------------------------------------------------------------

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: analyticsEventType("type").notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    visitorHash: text("visitor_hash"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("analytics_type_product_idx").on(t.type, t.productId), index("analytics_created_idx").on(t.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    details: jsonb("details"),
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

/** Fixed-window counters shared by every app instance. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type Product3dAsset = typeof product3dAssets.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type ProductStatus = (typeof productStatus.enumValues)[number];
export type ProductCategory = (typeof productCategory.enumValues)[number];
export type AnalyticsEventType = (typeof analyticsEventType.enumValues)[number];
