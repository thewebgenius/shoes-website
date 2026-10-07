import "server-only";
import { env, type Env } from "../env";
import { AnthropicVisionMetadataProvider } from "./providers/anthropic";
import { FashnVirtualTryOnProvider } from "./providers/fashn";
import { HttpEmbeddingProvider, HttpImageEnhancementProvider, HttpMetadataProvider, HttpThreeDGenerationProvider, HttpVirtualTryOnProvider } from "./providers/http";
import { NotConfiguredImageEnhancement, NotConfiguredMetadata, NotConfiguredThreeD, NotConfiguredTryOn } from "./providers/not-configured";
import { PhotoroomImageEnhancementProvider } from "./providers/photoroom";
import {
  LocalFeatureEmbeddingProvider,
  LocalImageEnhancementProvider,
  LocalMetadataProvider,
  LocalRulesModerationProvider,
  MockVirtualTryOnProvider,
} from "./local/providers";
import type {
  EmbeddingProvider,
  ImageEnhancementProvider,
  MetadataSuggestionProvider,
  ModerationProvider,
  ThreeDGenerationProvider,
  VirtualTryOnProvider,
} from "./types";

export type AiProviders = {
  imageEnhancement: ImageEnhancementProvider;
  metadata: MetadataSuggestionProvider;
  threeD: ThreeDGenerationProvider;
  tryOn: VirtualTryOnProvider;
  embedding: EmbeddingProvider;
  moderation: ModerationProvider;
};

const MOCKS_REFUSED = "Development mocks are disabled in production. Configure a real provider (or set AI_ALLOW_MOCK_PROVIDERS=true for testing only).";

/**
 * Chooses each provider from configuration. Nothing falls back silently:
 * an unset or incomplete provider becomes "AI provider not configured", and a
 * development mock is used only when asked for by name.
 */
export function buildProviders(e: Env): AiProviders {
  const mocksAllowed = e.NODE_ENV !== "production" || e.AI_ALLOW_MOCK_PROVIDERS;

  const imageEnhancement = ((): ImageEnhancementProvider => {
    switch (e.IMAGE_ENHANCEMENT_PROVIDER) {
      case "photoroom":
        return new PhotoroomImageEnhancementProvider(e.IMAGE_ENHANCEMENT_API_KEY);
      case "http":
        return new HttpImageEnhancementProvider(e.IMAGE_ENHANCEMENT_API_URL, e.IMAGE_ENHANCEMENT_API_KEY);
      case "mock":
      case "local":
        return mocksAllowed ? new LocalImageEnhancementProvider() : new NotConfiguredImageEnhancement("mock-refused", MOCKS_REFUSED);
      default:
        return new NotConfiguredImageEnhancement("none", "Set IMAGE_ENHANCEMENT_PROVIDER=photoroom and IMAGE_ENHANCEMENT_API_KEY.");
    }
  })();

  const metadata = ((): MetadataSuggestionProvider => {
    switch (e.METADATA_PROVIDER) {
      case "anthropic":
        return new AnthropicVisionMetadataProvider(e.METADATA_API_KEY, e.METADATA_MODEL);
      case "http":
        return new HttpMetadataProvider(e.METADATA_API_URL, e.METADATA_API_KEY);
      case "mock":
      case "local":
        return mocksAllowed ? new LocalMetadataProvider() : new NotConfiguredMetadata("mock-refused", MOCKS_REFUSED);
      default:
        return new NotConfiguredMetadata("none", "Set METADATA_PROVIDER=anthropic and METADATA_API_KEY.");
    }
  })();

  const tryOnKey = e.VIRTUAL_TRYON_API_KEY || e.TRYON_API_KEY;
  const tryOn = ((): VirtualTryOnProvider => {
    switch (e.TRYON_PROVIDER) {
      case "fashn":
        return new FashnVirtualTryOnProvider(tryOnKey);
      case "http":
        return new HttpVirtualTryOnProvider(e.TRYON_API_URL, tryOnKey);
      case "mock":
        return mocksAllowed ? new MockVirtualTryOnProvider() : new NotConfiguredTryOn("mock-refused", MOCKS_REFUSED);
      default:
        return new NotConfiguredTryOn("none", "Set TRYON_PROVIDER=fashn and VIRTUAL_TRYON_API_KEY.");
    }
  })();

  return {
    imageEnhancement,
    metadata,
    tryOn,
    threeD: e.THREE_D_PROVIDER === "http" ? new HttpThreeDGenerationProvider(e.THREE_D_API_URL, e.THREE_D_API_KEY) : new NotConfiguredThreeD("none", "Photo-to-3D is not configured."),
    embedding: e.EMBEDDING_PROVIDER === "http" ? new HttpEmbeddingProvider(e.EMBEDDING_API_URL, e.EMBEDDING_API_KEY) : new LocalFeatureEmbeddingProvider(),
    moderation: new LocalRulesModerationProvider(),
  };
}

let cached: AiProviders | null = null;

/** The configured providers (built once per server process). */
export function aiProviders(): AiProviders {
  cached ??= buildProviders(env());
  return cached;
}

/** Safe-to-render summary of one provider: never includes keys or URLs. */
export function describe(p: { id: string; label: string; kind: string; configured: boolean; notConfiguredReason?: string }) {
  return { id: p.id, label: p.label, kind: p.kind as "ai" | "mock" | "algorithm" | "none", configured: p.configured, reason: p.configured ? undefined : p.notConfiguredReason };
}
