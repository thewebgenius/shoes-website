/**
 * AI provider interfaces. The app talks only to these interfaces; which vendor
 * sits behind each one is configuration (see registry.ts).
 *
 *   Interface
 *     ├── Real provider        (Photoroom, Claude, FASHN, or a generic HTTPS service)
 *     ├── Not configured       (default: every call fails with "AI provider not configured")
 *     └── Development mock     (only when explicitly configured; always labelled "not AI")
 *
 * Provider calls happen only on the server, never from React components.
 */

export type ProviderKind =
  /** A real external AI service is called. */
  | "ai"
  /** Explicitly configured development stand-in. Not AI; always labelled. */
  | "mock"
  /** Deterministic local algorithm that is not AI (e.g. colour/shape features). */
  | "algorithm"
  /** Nothing configured. Calls fail with "AI provider not configured". */
  | "none";

export interface ProviderInfo {
  /** Stable identifier stored with results, e.g. "photoroom-v2-edit". */
  readonly id: string;
  /** Human label shown to admins. */
  readonly label: string;
  readonly kind: ProviderKind;
  /** True for anything that is not a real AI model. Kept for stored rows and the UI. */
  readonly isMock: boolean;
  /** False when the provider can't run; `notConfiguredReason` says what to set. */
  readonly configured: boolean;
  readonly notConfiguredReason?: string;
}

// --- Image enhancement -------------------------------------------------------

export type EnhancementResult = {
  /** The shoe centred on a transparent square canvas with consistent padding (PNG). */
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
  category: Suggested<"men" | "women" | "kids">;
  gender: Suggested<"male" | "female" | "unisex">;
  color: Suggested<string>;
  secondaryColors?: Suggested<string>;
  style?: Suggested<string>;
  description: Suggested<string>;
  /** Null unless the model is confident it can read the brand. */
  brand?: Suggested<string>;
  /** Null unless the model is confident it can identify the model name. */
  model?: Suggested<string>;
  /** True when any field is uncertain. The shopkeeper must verify regardless. */
  needsVerification?: boolean;
  /** Problems the model saw in the processed cutout (hands, floor left in, parts of the shoe missing). */
  cutoutIssues?: string[];
};

/** Below this confidence the admin UI shows "Needs verification" instead of a value. */
export const CONFIDENCE_THRESHOLD = 0.6;

export interface MetadataSuggestionProvider extends ProviderInfo {
  /**
   * `cutout` is the processed shoe; `original` is the raw photo (already
   * compressed), which helps read logos and judge the cutout.
   */
  suggest(input: { cutout: Buffer; original?: Buffer }): Promise<MetadataSuggestion>;
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
 * `x`/`y` are the centre of the shoe and `scale` is its width. Only the
 * development mock uses it; real try-on models find the feet themselves.
 */
export type TryOnPlacement = { x: number; y: number; scale: number };

export const DEFAULT_PLACEMENT: TryOnPlacement = { x: 0.5, y: 0.88, scale: 0.42 };

export type TryOnInput = {
  /** Customer photo, validated, metadata stripped and compressed. */
  personImage: Buffer;
  /** Product photo of the shoe (flattened on white, JPEG). */
  productImage: Buffer;
  productName: string;
  placement: TryOnPlacement;
};

export interface VirtualTryOnProvider extends ProviderInfo {
  /** True only for the development mock, which needs the customer to place the shoe. */
  readonly usesPlacement: boolean;
  /** Returns an "AI visual preview" image. Not a fit or size prediction. */
  tryOn(input: TryOnInput, hooks?: { onRetry?: (attempt: number) => Promise<void> | void }): Promise<{ image: Buffer }>;
}

// --- Embeddings --------------------------------------------------------------

export interface EmbeddingProvider extends ProviderInfo {
  readonly model: string;
  readonly dimensions: number;
  embed(image: Buffer): Promise<number[]>;
}

// --- Moderation --------------------------------------------------------------

export type ModerationResult = { verdict: "spam" | "flagged" | "clean"; flags: string[] };

export interface ModerationProvider extends ProviderInfo {
  /** Screens text. Never publishes anything by itself; people still approve reviews. */
  screen(input: { displayName: string; body: string }): Promise<ModerationResult>;
}
