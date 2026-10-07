CREATE TYPE "public"."analytics_event_type" AS ENUM('product_view', 'model_interaction', 'tryon_start', 'tryon_complete', 'visual_search', 'review_submit');--> statement-breakpoint
CREATE TYPE "public"."image_kind" AS ENUM('raw', 'processed', 'cutout');--> statement-breakpoint
CREATE TYPE "public"."ai_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."ai_job_type" AS ENUM('image_enhancement', 'metadata_suggestion', 'three_d_generation', 'embedding');--> statement-breakpoint
CREATE TYPE "public"."model_source" AS ENUM('admin_upload', 'ai_generated', 'sample_library');--> statement-breakpoint
CREATE TYPE "public"."product_category" AS ENUM('men', 'women', 'kids');--> statement-breakpoint
CREATE TYPE "public"."product_gender" AS ENUM('male', 'female', 'unisex');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'pending_review', 'published', 'rejected', 'unpublished', 'archived');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected', 'spam');--> statement-breakpoint
CREATE TYPE "public"."tryon_status" AS ENUM('processing', 'completed', 'failed', 'expired', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'shopkeeper');--> statement-breakpoint
CREATE TABLE "ai_processing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "ai_job_type" NOT NULL,
	"status" "ai_job_status" DEFAULT 'queued' NOT NULL,
	"product_id" uuid,
	"input_image_id" uuid,
	"output_image_id" uuid,
	"provider" text NOT NULL,
	"is_mock" boolean DEFAULT false NOT NULL,
	"result" jsonb,
	"error" text,
	"created_by" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" "analytics_event_type" NOT NULL,
	"product_id" uuid,
	"visitor_hash" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_3d_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"source" "model_source" NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"bytes" integer NOT NULL,
	"format" text DEFAULT 'glb' NOT NULL,
	"triangle_count" integer,
	"provider" text,
	"license" text,
	"attribution" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" "image_kind" NOT NULL,
	"source_image_id" uuid,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"variants" jsonb,
	"is_primary" boolean DEFAULT false NOT NULL,
	"alt_text" text,
	"processing_provider" text,
	"embedding" vector(512),
	"embedding_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" "product_category" NOT NULL,
	"gender" "product_gender" DEFAULT 'unisex' NOT NULL,
	"shoe_type" text,
	"brand" text,
	"color" text,
	"description" text,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"metadata_verified" boolean DEFAULT false NOT NULL,
	"ai_suggestions" jsonb,
	"rejection_reason" text,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"voter_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"display_name" text NOT NULL,
	"body" text NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"moderation_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ip_hash" text,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tryon_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"status" "tryon_status" DEFAULT 'processing' NOT NULL,
	"provider" text NOT NULL,
	"is_mock" boolean DEFAULT false NOT NULL,
	"result_storage_key" text,
	"access_token_hash" text,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"error" text,
	"ip_hash" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'shopkeeper' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "visual_search_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text NOT NULL,
	"provider" text NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"top_product_id" uuid,
	"ip_hash" text,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_processing_jobs" ADD CONSTRAINT "ai_processing_jobs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_processing_jobs" ADD CONSTRAINT "ai_processing_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_3d_assets" ADD CONSTRAINT "product_3d_assets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_3d_assets" ADD CONSTRAINT "product_3d_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryon_sessions" ADD CONSTRAINT "tryon_sessions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_search_sessions" ADD CONSTRAINT "visual_search_sessions_top_product_id_products_id_fk" FOREIGN KEY ("top_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_jobs_product_idx" ON "ai_processing_jobs" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "analytics_type_product_idx" ON "analytics_events" USING btree ("type","product_id");--> statement-breakpoint
CREATE INDEX "analytics_created_idx" ON "analytics_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "product_3d_assets_product_idx" ON "product_3d_assets" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_images_embedding_idx" ON "product_images" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "products_status_category_idx" ON "products" USING btree ("status","category");--> statement-breakpoint
CREATE UNIQUE INDEX "review_votes_unique" ON "review_votes" USING btree ("review_id","voter_hash");--> statement-breakpoint
CREATE INDEX "reviews_product_status_idx" ON "reviews" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "tryon_expires_idx" ON "tryon_sessions" USING btree ("expires_at");