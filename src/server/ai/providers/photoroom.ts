import "server-only";
import sharp from "sharp";
import { ProviderError } from "../errors";
import { alphaCoverage, compressForUpload, trimTransparent } from "../image-utils";
import { providerFetch, readCapped } from "../resilience";
import type { EnhancementResult, ImageEnhancementProvider } from "../types";

/**
 * Photoroom Image Editing API (v2/edit): AI background removal, centred on a
 * square transparent canvas with even padding.
 *
 * Docs: https://docs.photoroom.com/getting-started/api-reference-openapi
 *   POST https://image-api.photoroom.com/v2/edit   (multipart/form-data)
 *   header  x-api-key: <key>
 *   imageFile        the photo
 *   removeBackground true (default)
 *   padding          0.1          (10% padding around the subject)
 *   outputSize       1200x1200
 *   export.format    png          (no background.color = transparent)
 *   errors: 400 { error: { message } }, 402 { error: { detail } }, 429 rate limit, 5xx
 *
 * No generative options (shadows, relighting, AI backgrounds) are requested,
 * so the shoe's pixels are the real shoe's pixels. Photoroom states it does not
 * save images processed through the API. Keys starting with "sandbox_" are free
 * and return a watermarked image, which is fine for testing.
 */

const ENDPOINT = "https://image-api.photoroom.com/v2/edit";
const CANVAS = 1200;
const PADDING = "0.1";
const SEND_MAX_EDGE = 2500;
const TIMEOUT_MS = 60_000;

export class PhotoroomImageEnhancementProvider implements ImageEnhancementProvider {
  readonly id = "photoroom-v2-edit";
  readonly label = "Photoroom AI background removal";
  readonly kind = "ai" as const;
  readonly isMock = false;
  readonly configured: boolean;
  readonly notConfiguredReason?: string;

  constructor(private apiKey?: string) {
    this.configured = !!apiKey;
    if (!apiKey) this.notConfiguredReason = "Set IMAGE_ENHANCEMENT_API_KEY to your Photoroom API key.";
  }

  async enhance(input: Buffer): Promise<EnhancementResult> {
    if (!this.apiKey) throw new ProviderError(this.id, "not_configured");
    const warnings: string[] = [];
    const steps: EnhancementResult["steps"] = [];

    const upload = await compressForUpload(input, SEND_MAX_EDGE, 92);
    const form = new FormData();
    form.set("imageFile", new Blob([new Uint8Array(upload)], { type: "image/jpeg" }), "shoe.jpg");
    form.set("removeBackground", "true");
    form.set("padding", PADDING);
    form.set("outputSize", `${CANVAS}x${CANVAS}`);
    form.set("export.format", "png");

    const res = await providerFetch(this.id, ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": this.apiKey },
      body: form,
      timeoutMs: TIMEOUT_MS,
      errorDetail: (status, body) => {
        let detail: string | undefined;
        try {
          const j = JSON.parse(body) as { error?: { message?: string; detail?: string } };
          detail = (j.error?.message ?? j.error?.detail)?.slice(0, 200);
        } catch {}
        return { detail: detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}` };
      },
    });
    const processedRaw = await readCapped(this.id, res, 40 * 1024 * 1024);

    let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
    try {
      meta = await sharp(processedRaw).metadata();
    } catch {
      throw new ProviderError(this.id, "bad_response", "result is not an image");
    }
    if (!meta.width || !meta.height) throw new ProviderError(this.id, "bad_response", "result has no dimensions");
    const processed = await sharp(processedRaw).ensureAlpha().png().toBuffer();
    const coverage = await alphaCoverage(processed);
    if (!coverage.hasTransparency) throw new ProviderError(this.id, "bad_response", "result has no transparent background");
    if (coverage.opaqueShare < 0.01) throw new ProviderError(this.id, "invalid_input", "no subject found in the photo");

    steps.push({ name: "Background removal", detail: "Photoroom AI segmentation. Floor and backdrop removed; shoe pixels are not regenerated." });
    steps.push({ name: "Crop & centre", detail: `Centred on a ${CANVAS}×${CANVAS} transparent canvas with 10% padding.` });
    if (Math.max(meta.width, meta.height) < CANVAS) warnings.push("The result is smaller than expected; check sharpness.");
    if (this.apiKey.startsWith("sandbox_")) warnings.push("Photoroom sandbox key: this result carries a watermark. Use a live key for real product photos.");

    const cutout = await trimTransparent(processed);
    return { processed, cutout, steps, warnings };
  }
}
