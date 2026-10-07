import { describe, expect, it } from "vitest";
import { buildProviders } from "@/server/ai/registry";
import type { Env } from "@/server/env";

const base = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://x:y@localhost/z",
  APP_URL: "http://localhost:3000",
  ALLOWED_ORIGINS: "",
  APP_SECRET: "x".repeat(40),
  STORAGE_DIR: "./storage",
  HTTPS: false,
  TRUST_PROXY: false,
  IMAGE_ENHANCEMENT_PROVIDER: "none",
  METADATA_PROVIDER: "none",
  METADATA_MODEL: "claude-sonnet-5-5",
  THREE_D_PROVIDER: "none",
  TRYON_PROVIDER: "none",
  TRYON_RESOLUTION: "2k",
  EMBEDDING_PROVIDER: "local",
  AI_ALLOW_MOCK_PROVIDERS: false,
  MAX_IMAGE_UPLOAD_MB: 10,
  MAX_MODEL_UPLOAD_MB: 25,
  TRYON_RESULT_TTL_MINUTES: 30,
} as Env;

describe("provider registry", () => {
  it("defaults every AI capability to 'not configured' (no silent fallback)", async () => {
    const p = buildProviders(base);
    for (const prov of [p.imageEnhancement, p.metadata, p.tryOn]) {
      expect(prov.configured).toBe(false);
      expect(prov.kind).toBe("none");
      expect(prov.label).toBe("AI provider not configured");
    }
    await expect(p.imageEnhancement.enhance(Buffer.alloc(1))).rejects.toMatchObject({ code: "not_configured" });
    await expect(p.metadata.suggest({ cutout: Buffer.alloc(1) })).rejects.toMatchObject({ code: "not_configured" });
    expect(p.threeD.available).toBe(false);
  });

  it("selects a real provider but marks it not configured when the key is missing", () => {
    const p = buildProviders({ ...base, IMAGE_ENHANCEMENT_PROVIDER: "photoroom", METADATA_PROVIDER: "anthropic", TRYON_PROVIDER: "fashn" });
    expect(p.imageEnhancement.id).toBe("photoroom-v2-edit");
    expect(p.imageEnhancement.configured).toBe(false);
    expect(p.imageEnhancement.notConfiguredReason).toMatch(/IMAGE_ENHANCEMENT_API_KEY/);
    expect(p.metadata.configured).toBe(false);
    expect(p.tryOn.configured).toBe(false);
    expect(p.tryOn.notConfiguredReason).toMatch(/VIRTUAL_TRYON_API_KEY/);
  });

  it("selects real providers with keys and labels them as AI", () => {
    const p = buildProviders({
      ...base,
      IMAGE_ENHANCEMENT_PROVIDER: "photoroom",
      IMAGE_ENHANCEMENT_API_KEY: "k1",
      METADATA_PROVIDER: "anthropic",
      METADATA_API_KEY: "k2",
      TRYON_PROVIDER: "fashn",
      VIRTUAL_TRYON_API_KEY: "k3",
    });
    for (const prov of [p.imageEnhancement, p.metadata, p.tryOn]) {
      expect(prov.configured).toBe(true);
      expect(prov.kind).toBe("ai");
      expect(prov.isMock).toBe(false);
    }
    expect(p.tryOn.usesPlacement).toBe(false);
  });

  it("ignores old mock settings unless AI_ALLOW_MOCK_PROVIDERS=true, even in development", () => {
    const p = buildProviders({ ...base, IMAGE_ENHANCEMENT_PROVIDER: "local", METADATA_PROVIDER: "local", TRYON_PROVIDER: "mock" });
    for (const prov of [p.imageEnhancement, p.metadata, p.tryOn]) {
      expect(prov.configured).toBe(false);
      expect(prov.notConfiguredReason).toMatch(/switched off/);
    }
    expect(p.tryOn.notConfiguredReason).toMatch(/TRYON_PROVIDER=fashn/);
  });

  it("uses development mocks only when explicitly allowed and named, and labels them", () => {
    const p = buildProviders({ ...base, AI_ALLOW_MOCK_PROVIDERS: true, IMAGE_ENHANCEMENT_PROVIDER: "mock", METADATA_PROVIDER: "local", TRYON_PROVIDER: "mock" });
    for (const prov of [p.imageEnhancement, p.metadata, p.tryOn]) {
      expect(prov.kind).toBe("mock");
      expect(prov.label).toMatch(/Development mock \(not AI\)/);
    }
  });

  it("refuses mocks in production unless explicitly allowed", () => {
    const prod = { ...base, NODE_ENV: "production", IMAGE_ENHANCEMENT_PROVIDER: "mock", TRYON_PROVIDER: "mock" } as Env;
    const refused = buildProviders(prod);
    expect(refused.imageEnhancement.configured).toBe(false);
    expect(refused.tryOn.configured).toBe(false);
    expect(refused.tryOn.notConfiguredReason).toMatch(/switched off/);
    const allowed = buildProviders({ ...prod, AI_ALLOW_MOCK_PROVIDERS: true });
    expect(allowed.tryOn.kind).toBe("mock");
  });

  it("never labels the local similarity search or moderation rules as AI", () => {
    const p = buildProviders(base);
    expect(p.embedding.kind).toBe("algorithm");
    expect(p.moderation.kind).toBe("algorithm");
    expect(p.embedding.label).toMatch(/not AI/);
  });
});
