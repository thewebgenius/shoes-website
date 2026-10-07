import "server-only";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

/** Treats an empty value (`FOO=` in an env file) as unset. */
const opt = <T extends z.ZodType>(t: T) => z.preprocess((v) => (v === "" ? undefined : v), t);
const choice = <const V extends readonly [string, ...string[]]>(values: V, fallback: V[number]) => opt(z.enum(values).default(fallback as never));

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  ALLOWED_ORIGINS: z.string().optional().default(""),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  STORAGE_DIR: z.string().default("./storage"),
  HTTPS: bool,
  TRUST_PROXY: bool,

  // AI providers. Unset = "none" = "AI provider not configured". "local" is the old name for "mock".
  IMAGE_ENHANCEMENT_PROVIDER: choice(["none", "photoroom", "http", "mock", "local"], "none"),
  IMAGE_ENHANCEMENT_API_URL: z.string().optional(),
  IMAGE_ENHANCEMENT_API_KEY: z.string().optional(),
  METADATA_PROVIDER: choice(["none", "anthropic", "http", "mock", "local"], "none"),
  METADATA_MODEL: opt(z.string().regex(/^[\w.-]{1,80}$/).default("claude-sonnet-5-5")),
  METADATA_API_URL: z.string().optional(),
  METADATA_API_KEY: z.string().optional(),
  THREE_D_PROVIDER: choice(["none", "http", "mock"], "none"),
  THREE_D_API_URL: z.string().optional(),
  THREE_D_API_KEY: z.string().optional(),
  TRYON_PROVIDER: choice(["none", "fashn", "http", "mock"], "none"),
  TRYON_API_URL: z.string().optional(),
  VIRTUAL_TRYON_API_KEY: z.string().optional(),
  /** Older name for VIRTUAL_TRYON_API_KEY. */
  TRYON_API_KEY: z.string().optional(),
  EMBEDDING_PROVIDER: choice(["local", "http"], "local"),
  EMBEDDING_API_URL: z.string().optional(),
  EMBEDDING_API_KEY: z.string().optional(),
  /** Development mocks are refused in production builds unless this is true (used by the E2E suite). */
  AI_ALLOW_MOCK_PROVIDERS: bool,

  MAX_IMAGE_UPLOAD_MB: z.coerce.number().positive().max(50).default(10),
  MAX_MODEL_UPLOAD_MB: z.coerce.number().positive().max(100).default(25),
  /** How long a try-on photo and its previews are kept before automatic deletion. */
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
