import "server-only";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  ALLOWED_ORIGINS: z.string().optional().default(""),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  STORAGE_DIR: z.string().default("./storage"),
  HTTPS: bool,
  TRUST_PROXY: bool,

  IMAGE_ENHANCEMENT_PROVIDER: z.enum(["local", "http"]).default("local"),
  IMAGE_ENHANCEMENT_API_URL: z.string().optional(),
  IMAGE_ENHANCEMENT_API_KEY: z.string().optional(),
  METADATA_PROVIDER: z.enum(["local", "http"]).default("local"),
  METADATA_API_URL: z.string().optional(),
  METADATA_API_KEY: z.string().optional(),
  THREE_D_PROVIDER: z.enum(["mock", "http"]).default("mock"),
  THREE_D_API_URL: z.string().optional(),
  THREE_D_API_KEY: z.string().optional(),
  TRYON_PROVIDER: z.enum(["mock", "http"]).default("mock"),
  TRYON_API_URL: z.string().optional(),
  TRYON_API_KEY: z.string().optional(),
  EMBEDDING_PROVIDER: z.enum(["local", "http"]).default("local"),
  EMBEDDING_API_URL: z.string().optional(),
  EMBEDDING_API_KEY: z.string().optional(),

  MAX_IMAGE_UPLOAD_MB: z.coerce.number().positive().max(50).default(10),
  MAX_MODEL_UPLOAD_MB: z.coerce.number().positive().max(100).default(25),
  TRYON_RESULT_TTL_MINUTES: z.coerce.number().int().positive().max(24 * 60).default(30),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated server environment. Throws with a readable message when misconfigured. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment: ${issues}`);
  }
  if (parsed.data.NODE_ENV === "production" && /change-me|dev-only/i.test(parsed.data.APP_SECRET)) {
    throw new Error("APP_SECRET looks like a development placeholder; set a strong random secret in production.");
  }
  cached = parsed.data;
  return cached;
}

export function allowedOrigins(): string[] {
  const e = env();
  const list = e.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  return [new URL(e.APP_URL).origin, ...list];
}
