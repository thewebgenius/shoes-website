ALTER TYPE "public"."ai_job_status" ADD VALUE 'retrying' BEFORE 'succeeded';--> statement-breakpoint
ALTER TYPE "public"."ai_job_status" ADD VALUE 'needs_review' BEFORE 'failed';--> statement-breakpoint
ALTER TYPE "public"."product_status" ADD VALUE 'approved' BEFORE 'published';--> statement-breakpoint
ALTER TYPE "public"."tryon_status" ADD VALUE 'queued' BEFORE 'processing';--> statement-breakpoint
ALTER TYPE "public"."tryon_status" ADD VALUE 'retrying' BEFORE 'completed';--> statement-breakpoint
CREATE TABLE "tryon_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text,
	"access_token_hash" text,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"ip_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_processing_jobs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "secondary_colors" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "style" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "model_name" text;--> statement-breakpoint
ALTER TABLE "tryon_sessions" ADD COLUMN "photo_id" uuid;--> statement-breakpoint
ALTER TABLE "tryon_sessions" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "tryon_photos_expires_idx" ON "tryon_photos" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "tryon_sessions" ADD CONSTRAINT "tryon_sessions_photo_id_tryon_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."tryon_photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_images_hash_idx" ON "product_images" USING btree ("product_id","content_hash");--> statement-breakpoint
CREATE INDEX "tryon_photo_product_idx" ON "tryon_sessions" USING btree ("photo_id","product_id");