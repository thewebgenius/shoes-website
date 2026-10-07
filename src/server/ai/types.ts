/**
 * AI provider interfaces. Every capability has a local/mock implementation for
 * development and an HTTP implementation for plugging in a real service. Both
 * implement the same interface, so swapping providers is configuration only.
 *
 *   AI Provider Interface
 *        ├── Local / Mock provider   (default, no external calls)
 *        └── Production provider     (HTTP adapter, configured by env)
 */

export interface ProviderInfo {
  /** Stable identifier stored with results, e.g. "local-basic-v1". */
  readonly id: string;
  /** Human label shown to admins. */
  readonly label: string;
  /** True when results are not produced by a real AI model. Surfaced in the UI. */
  readonly isMock: boolean;
}

// --- Image enhancement -------------------------------------------------------

export type EnhancementResult = {
  /** Product photo on a clean white square background (PNG). */
  processed: Buffer;
  /** The shoe isolated on a transparent background, tightly cropped (PNG). */
  cutout: Buffer;
  steps: Array<{ name: string; detail: string }>;
  warnings: string[];
};

export interface ImageEnhancementProvider extends ProviderInfo {
  /** Must preserve the real shoe's appearance: no generative redesign. */
  enhance(input: Buffer): Promise<EnhancementResult>;
}

// --- Metadata suggestion -----------------------------------------------------

export type Suggested<T> = { value: T | null; confidence: number; reason?: string };

export type MetadataSuggestion = {
  shoeType: Suggested<string>;
  color: Suggested<string>;
  category: Suggested<"men" | "women" | "kids">;
  gender: Suggested<"male" | "female" | "unisex">;
  description: Suggested<string>;
};

/** Below this confidence the admin UI shows "Needs verification" instead of a value. */
export const CONFIDENCE_THRESHOLD = 0.6;

export interface MetadataSuggestionProvider extends ProviderInfo {
  suggest(cutout: Buffer): Promise<MetadataSuggestion>;
}

// --- 3D generation (Phase 2 capability, interface defined now) ---------------

export type ThreeDGenerationResult = { glb: Buffer; notes?: string };

export interface ThreeDGenerationProvider extends ProviderInfo {
  /** False when no real reconstruction service is configured. */
  readonly available: boolean;
  readonly unavailableReason?: string;
  generate(input: { images: Buffer[]; productName: string }): Promise<ThreeDGenerationResult>;
}

// --- Virtual try-on ----------------------------------------------------------

/**
 * Where the customer asked for the shoe to appear, as fractions of the photo:
 * `x`/`y` are the centre of the shoe and `scale` is its width. A real try-on
 * model is free to treat this as a hint; the development mock composites there
 * exactly, which is why the customer is the one who positions it.
 */
export type TryOnPlacement = { x: number; y: number; scale: number };

export const DEFAULT_PLACEMENT: TryOnPlacement = { x: 0.5, y: 0.88, scale: 0.42 };

export type TryOnInput = {
  /** Customer photo, already validated and stripped of metadata. Never persisted. */
  personImage: Buffer;
  /** Product cutout with transparent background. */
  productImage: Buffer;
  productName: string;
  placement: TryOnPlacement;
};

export interface VirtualTryOnProvider extends ProviderInfo {
  /** Returns a JPEG "AI-generated visual preview". Not a fit or size prediction. */
  tryOn(input: TryOnInput): Promise<{ image: Buffer }>;
}

// --- Embeddings --------------------------------------------------------------

export interface EmbeddingProvider extends ProviderInfo {
  readonly model: string;
  readonly dimensions: number;
  embed(image: Buffer): Promise<number[]>;
}

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}
