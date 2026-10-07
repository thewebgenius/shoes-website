import "server-only";
import { ProviderError } from "../errors";
import { providerFetch } from "../resilience";
import type {
  EmbeddingProvider,
  EnhancementResult,
  ImageEnhancementProvider,
  MetadataSuggestion,
  MetadataSuggestionProvider,
  ThreeDGenerationProvider,
  TryOnInput,
  VirtualTryOnProvider,
} from "../types";

/**
 * Generic HTTPS JSON adapters for services that are not built in (your own
 * gateway in front of any vendor). Select them with `*_PROVIDER=http`.
 *
 * Contract (all endpoints: POST, Authorization: Bearer <API_KEY>):
 *   enhancement  { image }                         -> { processed, cutout, steps?, warnings? }
 *   metadata     { image, original? }              -> MetadataSuggestion
 *   3d           { images[], productName }         -> { glb }
 *   tryon        { personImage, productImage, productName } -> { image }
 *   embedding    { image }                         -> { embedding: number[512], model }
 */

const TIMEOUT_MS = 90_000;
const MAX_RESPONSE_BYTES = 40 * 1024 * 1024;

async function call<T>(provider: string, url: string | undefined, key: string | undefined, body: unknown): Promise<T> {
  if (!url || !key) throw new ProviderError(provider, "not_configured");
  const res = await providerFetch(provider, url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    timeoutMs: TIMEOUT_MS,
  });
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_RESPONSE_BYTES) throw new ProviderError(provider, "bad_response", "response too large");
  try {
    return (await res.json()) as T;
  } catch {
    throw new ProviderError(provider, "bad_response", "response is not JSON");
  }
}

const b64 = (b: Buffer) => b.toString("base64");
const unb64 = (provider: string, s: unknown, what: string) => {
  if (typeof s !== "string" || !s) throw new ProviderError(provider, "bad_response", `missing ${what}`);
  return Buffer.from(s, "base64");
};

abstract class HttpBase {
  readonly kind = "ai" as const;
  readonly isMock = false;
  readonly configured: boolean;
  readonly notConfiguredReason?: string;
  constructor(
    protected url: string | undefined,
    protected key: string | undefined,
    envPrefix: string,
  ) {
    this.configured = !!(url && key);
    if (!this.configured) this.notConfiguredReason = `Set ${envPrefix}_API_URL and the API key.`;
  }
}

export class HttpImageEnhancementProvider extends HttpBase implements ImageEnhancementProvider {
  readonly id = "http-enhancement";
  readonly label = "External image enhancement service";
  constructor(url?: string, key?: string) {
    super(url, key, "IMAGE_ENHANCEMENT");
  }
  async enhance(input: Buffer): Promise<EnhancementResult> {
    const r = await call<{ processed: string; cutout: string; steps?: EnhancementResult["steps"]; warnings?: string[] }>(this.id, this.url, this.key, { image: b64(input) });
    return { processed: unb64(this.id, r.processed, "processed"), cutout: unb64(this.id, r.cutout, "cutout"), steps: r.steps ?? [], warnings: r.warnings ?? [] };
  }
}

export class HttpMetadataProvider extends HttpBase implements MetadataSuggestionProvider {
  readonly id = "http-metadata";
  readonly label = "External metadata service";
  constructor(url?: string, key?: string) {
    super(url, key, "METADATA");
  }
  async suggest({ cutout, original }: { cutout: Buffer; original?: Buffer }): Promise<MetadataSuggestion> {
    return call<MetadataSuggestion>(this.id, this.url, this.key, { image: b64(cutout), original: original ? b64(original) : undefined });
  }
}

export class HttpThreeDGenerationProvider extends HttpBase implements ThreeDGenerationProvider {
  readonly id = "http-3d";
  readonly label = "External photo-to-3D service";
  readonly available: boolean;
  readonly unavailableReason?: string;
  constructor(url?: string, key?: string) {
    super(url, key, "THREE_D");
    this.available = this.configured;
    if (!this.available) this.unavailableReason = "THREE_D_API_URL / THREE_D_API_KEY are not configured.";
  }
  async generate(input: { images: Buffer[]; productName: string }) {
    const r = await call<{ glb: string; notes?: string }>(this.id, this.url, this.key, { images: input.images.map(b64), productName: input.productName });
    return { glb: unb64(this.id, r.glb, "glb"), notes: r.notes };
  }
}

export class HttpVirtualTryOnProvider extends HttpBase implements VirtualTryOnProvider {
  readonly id = "http-tryon";
  readonly label = "External virtual try-on service";
  readonly usesPlacement = false;
  constructor(url?: string, key?: string) {
    super(url, key, "TRYON");
  }
  async tryOn(input: TryOnInput) {
    // The photo is sent in the request body only, never by URL.
    const r = await call<{ image: string }>(this.id, this.url, this.key, {
      personImage: b64(input.personImage),
      productImage: b64(input.productImage),
      productName: input.productName,
      retention: "none",
      allowTraining: false,
    });
    return { image: unb64(this.id, r.image, "image") };
  }
}

export class HttpEmbeddingProvider extends HttpBase implements EmbeddingProvider {
  readonly id = "http-embedding";
  readonly label = "External image embedding service";
  readonly dimensions = 512;
  readonly model = "external-image-embedding";
  constructor(url?: string, key?: string) {
    super(url, key, "EMBEDDING");
  }
  async embed(image: Buffer) {
    const r = await call<{ embedding: number[] }>(this.id, this.url, this.key, { image: b64(image) });
    if (!Array.isArray(r.embedding) || r.embedding.length !== this.dimensions || r.embedding.some((x) => typeof x !== "number" || !Number.isFinite(x))) {
      throw new ProviderError(this.id, "bad_response", `embedding must be ${this.dimensions} finite numbers`);
    }
    return r.embedding;
  }
}
