import "server-only";
import { env } from "../env";
import {
  HttpEmbeddingProvider,
  HttpImageEnhancementProvider,
  HttpMetadataProvider,
  HttpThreeDGenerationProvider,
  HttpVirtualTryOnProvider,
} from "./http/providers";
import {
  LocalFeatureEmbeddingProvider,
  LocalImageEnhancementProvider,
  LocalMetadataProvider,
  MockThreeDGenerationProvider,
  MockVirtualTryOnProvider,
} from "./local/providers";
import type {
  EmbeddingProvider,
  ImageEnhancementProvider,
  MetadataSuggestionProvider,
  ThreeDGenerationProvider,
  VirtualTryOnProvider,
} from "./types";

/** Chooses each AI provider from environment configuration. */
export function aiProviders(): {
  imageEnhancement: ImageEnhancementProvider;
  metadata: MetadataSuggestionProvider;
  threeD: ThreeDGenerationProvider;
  tryOn: VirtualTryOnProvider;
  embedding: EmbeddingProvider;
} {
  const e = env();
  return {
    imageEnhancement:
      e.IMAGE_ENHANCEMENT_PROVIDER === "http"
        ? new HttpImageEnhancementProvider(e.IMAGE_ENHANCEMENT_API_URL, e.IMAGE_ENHANCEMENT_API_KEY)
        : new LocalImageEnhancementProvider(),
    metadata: e.METADATA_PROVIDER === "http" ? new HttpMetadataProvider(e.METADATA_API_URL, e.METADATA_API_KEY) : new LocalMetadataProvider(),
    threeD: e.THREE_D_PROVIDER === "http" ? new HttpThreeDGenerationProvider(e.THREE_D_API_URL, e.THREE_D_API_KEY) : new MockThreeDGenerationProvider(),
    tryOn: e.TRYON_PROVIDER === "http" ? new HttpVirtualTryOnProvider(e.TRYON_API_URL, e.TRYON_API_KEY) : new MockVirtualTryOnProvider(),
    embedding:
      e.EMBEDDING_PROVIDER === "http" ? new HttpEmbeddingProvider(e.EMBEDDING_API_URL, e.EMBEDDING_API_KEY) : new LocalFeatureEmbeddingProvider(),
  };
}
