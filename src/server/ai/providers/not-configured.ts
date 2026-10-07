import { ProviderError } from "../errors";
import type { ImageEnhancementProvider, MetadataSuggestionProvider, ThreeDGenerationProvider, VirtualTryOnProvider } from "../types";

/**
 * What the app uses when no provider is set. Every call fails with
 * "AI provider not configured" so nothing is ever faked.
 */

abstract class NotConfigured {
  readonly kind = "none" as const;
  readonly isMock = false;
  readonly configured = false;
  readonly label = "AI provider not configured";
  constructor(
    readonly id: string,
    readonly notConfiguredReason: string,
  ) {}
  protected fail(): never {
    throw new ProviderError(this.id, "not_configured", this.notConfiguredReason);
  }
}

export class NotConfiguredImageEnhancement extends NotConfigured implements ImageEnhancementProvider {
  async enhance(): Promise<never> {
    this.fail();
  }
}

export class NotConfiguredMetadata extends NotConfigured implements MetadataSuggestionProvider {
  async suggest(): Promise<never> {
    this.fail();
  }
}

export class NotConfiguredTryOn extends NotConfigured implements VirtualTryOnProvider {
  readonly usesPlacement = false;
  async tryOn(): Promise<never> {
    this.fail();
  }
}

export class NotConfiguredThreeD extends NotConfigured implements ThreeDGenerationProvider {
  readonly available = false;
  get unavailableReason() {
    return "Automatic photo-to-3D is not configured. Upload a GLB model, or assign a sample model for development.";
  }
  async generate(): Promise<never> {
    this.fail();
  }
}
