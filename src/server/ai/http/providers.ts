import "server-only";
import {
  ProviderUnavailableError,
  type EmbeddingProvider,
  type EnhancementResult,
  type ImageEnhancementProvider,
  type MetadataSuggestion,
  type MetadataSuggestionProvider,
  type ThreeDGenerationProvider,
  type VirtualTryOnProvider,
} from "../types";

/**
 * PRODUCTION INTEGRATION POINT.
 *
 * Generic HTTPS adapters for real AI services. Each expects a JSON API that
 * accepts base64 images and returns base64 images / JSON. To use a specific
 * vendor, either put a thin gateway in front of it that speaks this contract,
 * or replace the body of the relevant class. Nothing else in the app changes.
 *
 * Contract (all endpoints: POST, Authorization: Bearer <API_KEY>):
 *   enhancement  { image }                         -> { processed, cutout, steps?, warnings? }
 *   metadata     { image }                         -> MetadataSuggestion
 *   3d           { images[], productName }         -> { glb }
 *   tryon        { personImage, productImage, productName } -> { image }
 *   embedding    { image }                         -> { embedding: number[512], model }
 */

const TIMEOUT_MS = 90_000;
const MAX_RESPONSE_BYTES = 40 * 1024 * 1024;

async function call<T>(url: string | undefined, key: string | undefined, body: unknown): Promise<T> {
  if (!url || !key) throw new ProviderUnavailableError("Provider URL or API key is not configured.");
  const u = new URL(url);
  if (u.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new ProviderUnavailableError("AI provider URL must use HTTPS in production.");
  }
  const res = await fetch(u, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "error",
  });
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_RESPONSE_BYTES) throw new Error("AI provider response too large");
  if (!res.ok) throw new Error(`AI provider returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

const b64 = (b: Buffer) => b.toString("base64");
const unb64 = (s: unknown, what: string) => {
  if (typeof s !== "string" || !s) throw new Error(`AI provider response missing ${what}`);
  return Buffer.from(s, "base64");
};

export class HttpImageEnhancementProvider implements ImageEnhancementProvider {
  readonly id = "http-enhancement";
  readonly label = "External image enhancement service";
  readonly isMock = false;
  constructor(private url?: string, private key?: string) {}
  async enhance(input: Buffer): Promise<EnhancementResult> {
    const r = await call<{ processed: string; cutout: string; steps?: EnhancementResult["steps"]; warnings?: string[] }>(this.url, this.key, {
      image: b64(input),
    });
    return { processed: unb64(r.processed, "processed"), cutout: unb64(r.cutout, "cutout"), steps: r.steps ?? [], warnings: r.warnings ?? [] };
  }
}

export class HttpMetadataProvider implements MetadataSuggestionProvider {
  readonly id = "http-metadata";
  readonly label = "External metadata service";
  readonly isMock = false;
  constructor(private url?: string, private key?: string) {}
  async suggest(cutout: Buffer): Promise<MetadataSuggestion> {
    return call<MetadataSuggestion>(this.url, this.key, { image: b64(cutout) });
  }
}

export class HttpThreeDGenerationProvider implements ThreeDGenerationProvider {
  readonly id = "http-3d";
  readonly label = "External photo-to-3D service";
  readonly isMock = false;
  readonly available: boolean;
  readonly unavailableReason?: string;
  constructor(private url?: string, private key?: string) {
    this.available = !!(url && key);
    if (!this.available) this.unavailableReason = "THREE_D_API_URL / THREE_D_API_KEY are not configured.";
  }
  async generate(input: { images: Buffer[]; productName: string }) {
    const r = await call<{ glb: string; notes?: string }>(this.url, this.key, { images: input.images.map(b64), productName: input.productName });
    return { glb: unb64(r.glb, "glb"), notes: r.notes };
  }
}

export class HttpVirtualTryOnProvider implements VirtualTryOnProvider {
  readonly id = "http-tryon";
  readonly label = "External virtual try-on service";
  readonly isMock = false;
  constructor(private url?: string, private key?: string) {}
  async tryOn(input: { personImage: Buffer; productImage: Buffer; productName: string }) {
    // The photo is sent in the request body only; it is never written to disk or exposed by URL.
    const r = await call<{ image: string }>(this.url, this.key, {
      personImage: b64(input.personImage),
      productImage: b64(input.productImage),
      productName: input.productName,
      // Ask the provider not to retain or train on customer images.
      retention: "none",
      allowTraining: false,
    });
    return { image: unb64(r.image, "image") };
  }
}

export class HttpEmbeddingProvider implements EmbeddingProvider {
  readonly id = "http-embedding";
  readonly label = "External image embedding service";
  readonly isMock = false;
  readonly dimensions = 512;
  constructor(
    private url?: string,
    private key?: string,
    readonly model = "external-image-embedding",
  ) {}
  async embed(image: Buffer) {
    const r = await call<{ embedding: number[] }>(this.url, this.key, { image: b64(image) });
    if (!Array.isArray(r.embedding) || r.embedding.length !== this.dimensions || r.embedding.some((x) => typeof x !== "number" || !Number.isFinite(x))) {
      throw new Error(`Embedding provider must return ${this.dimensions} finite numbers`);
    }
    return r.embedding;
  }
}
