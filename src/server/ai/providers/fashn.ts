import "server-only";
import sharp from "sharp";
import { ProviderError, type ProviderErrorCode } from "../errors";
import { compressForUpload, toDataUri } from "../image-utils";
import { DEFAULT_RETRY, providerFetch, withRetry } from "../resilience";
import type { TryOnInput, VirtualTryOnProvider } from "../types";

/**
 * FASHN Try-On Max: virtual try-on that supports shoes as well as clothing.
 *
 * Docs: https://docs.fashn.ai/api-reference/tryon-max and /api-overview/api-fundamentals
 *   POST https://api.fashn.ai/v1/run          { model_name: "tryon-max", inputs: {...} } -> { id, error }
 *   GET  https://api.fashn.ai/v1/status/{id}  -> { id, status, output[], error: { name, message } }
 *   status: starting | in_queue | processing | completed | failed
 *   header Authorization: Bearer <key>
 *   inputs: product_image, model_image (URL or data URI, max 30 MiB), prompt, resolution 1k|2k|4k,
 *           generation_mode fast|balanced|quality, num_images, output_format png|jpeg, return_base64
 *
 * Privacy: images are sent as base64 data URIs, never as public URLs. With
 * return_base64 FASHN keeps the output for 60 minutes (instead of 3 days) and
 * masks inputs in its request records; base64 inputs are deleted when the
 * request finishes. FASHN does not train on customer content unless the
 * account opts in.
 *
 * Quality: "balanced" mode at 2k (HD) by default; TRYON_RESOLUTION picks 1k/2k/4k.
 * Credits per run grow with resolution (see the FASHN pricing page).
 */

const BASE = "https://api.fashn.ai/v1";
const MODEL = "tryon-max";
const MODE = "balanced";
const PERSON_MAX_EDGE = 2560;
const PRODUCT_MAX_EDGE = 1200;
const POLL_EVERY_MS = 2500;
const OVERALL_TIMEOUT_MS = 180_000;

/**
 * Tells the model to change only the footwear and to keep the photo as it is,
 * so a feet-only photo stays feet-only and a full-body photo stays full-body.
 */
export const FOOTWEAR_PROMPT =
  "Replace only the footwear on the person's feet with the shoes from the product image. Keep the exact framing, crop, camera angle and image size. " +
  "Keep the person's identity, pose, body, clothing, hands and the background unchanged. Show natural occlusion by trousers or socks, " +
  "contact shadows on the ground and correct perspective for each foot.";

const RUNTIME_ERRORS: Record<string, ProviderErrorCode> = {
  ImageLoadError: "invalid_input",
  InputValidationError: "invalid_input",
  ContentModerationError: "content_rejected",
  ThirdPartyError: "upstream",
  UnavailableError: "upstream",
  PipelineError: "upstream",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class FashnVirtualTryOnProvider implements VirtualTryOnProvider {
  readonly id = `fashn-${MODEL}`;
  readonly label = "FASHN Try-On Max";
  readonly kind = "ai" as const;
  readonly isMock = false;
  readonly usesPlacement = false;
  readonly configured: boolean;
  readonly notConfiguredReason?: string;

  constructor(
    private apiKey?: string,
    private opts: { pollEveryMs?: number; timeoutMs?: number; resolution?: "1k" | "2k" | "4k" } = {},
  ) {
    this.configured = !!apiKey;
    if (!apiKey) this.notConfiguredReason = "Set VIRTUAL_TRYON_API_KEY to your FASHN API key.";
  }

  private headers() {
    return { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" };
  }

  private apiError = (status: number, body: string): { code?: ProviderErrorCode; detail?: string } => {
    let name: string | undefined;
    try {
      const j = JSON.parse(body) as { error?: string | { name?: string } };
      name = typeof j.error === "string" ? j.error : j.error?.name;
    } catch {}
    if (/OutOfCredits/i.test(name ?? body)) return { code: "quota", detail: "OutOfCredits" };
    if (/UnauthorizedAccess/i.test(name ?? "")) return { code: "auth", detail: `HTTP ${status} UnauthorizedAccess` };
    return { detail: `HTTP ${status}${name ? ` ${name}` : ""}` };
  };

  async tryOn(input: TryOnInput, hooks: { onRetry?: (attempt: number) => Promise<void> | void } = {}) {
    if (!this.apiKey) throw new ProviderError(this.id, "not_configured");
    const person = await compressForUpload(input.personImage, PERSON_MAX_EDGE, 90);
    const product = await compressForUpload(input.productImage, PRODUCT_MAX_EDGE, 90);

    return withRetry(
      "tryon",
      this.id,
      async () => {
        const run = await providerFetch(this.id, `${BASE}/run`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            model_name: MODEL,
            inputs: {
              model_image: toDataUri(person, "image/jpeg"),
              product_image: toDataUri(product, "image/jpeg"),
              prompt: FOOTWEAR_PROMPT,
              resolution: this.opts.resolution ?? "2k",
              generation_mode: MODE,
              num_images: 1,
              output_format: "jpeg",
              return_base64: true,
            },
          }),
          timeoutMs: 60_000,
          errorDetail: this.apiError,
        });
        const started = (await run.json().catch(() => null)) as { id?: string; error?: unknown } | null;
        if (!started?.id) throw new ProviderError(this.id, "bad_response", "no prediction id");
        return this.poll(started.id);
      },
      { policy: DEFAULT_RETRY, onRetry: (attempt) => hooks.onRetry?.(attempt) },
    );
  }

  private async poll(id: string): Promise<{ image: Buffer }> {
    const deadline = Date.now() + (this.opts.timeoutMs ?? OVERALL_TIMEOUT_MS);
    if (!/^[\w-]{1,100}$/.test(id)) throw new ProviderError(this.id, "bad_response", "malformed prediction id");
    while (Date.now() < deadline) {
      await sleep(this.opts.pollEveryMs ?? POLL_EVERY_MS);
      const res = await providerFetch(this.id, `${BASE}/status/${id}`, { method: "GET", headers: this.headers(), timeoutMs: 20_000, errorDetail: this.apiError });
      const s = (await res.json().catch(() => null)) as { status?: string; output?: string[]; error?: { name?: string; message?: string } | null } | null;
      if (!s?.status) throw new ProviderError(this.id, "bad_response", "status response without status");
      if (s.status === "completed") {
        const out = s.output?.[0];
        if (!out) throw new ProviderError(this.id, "bad_response", "completed without output");
        return { image: await this.decodeOutput(out) };
      }
      if (s.status === "failed") {
        const name = s.error?.name ?? "PipelineError";
        throw new ProviderError(this.id, RUNTIME_ERRORS[name] ?? "upstream", name);
      }
    }
    throw new ProviderError(this.id, "timeout", "prediction did not finish in time");
  }

  /** Output is base64 (optionally a data URI) when return_base64 is set; a URL is accepted from FASHN's CDN only. */
  private async decodeOutput(out: string): Promise<Buffer> {
    let buf: Buffer;
    if (/^https:\/\//.test(out)) {
      const host = new URL(out).hostname;
      if (!/(^|\.)fashn\.ai$/.test(host)) throw new ProviderError(this.id, "bad_response", "unexpected output host");
      const res = await providerFetch(this.id, out, { method: "GET", timeoutMs: 30_000 });
      buf = Buffer.from(await res.arrayBuffer());
    } else {
      buf = Buffer.from(out.replace(/^data:[^;]+;base64,/, ""), "base64");
    }
    try {
      // Re-encode: strips any metadata and proves it is an image.
      return await sharp(buf).rotate().jpeg({ quality: 90 }).toBuffer();
    } catch {
      throw new ProviderError(this.id, "bad_response", "output is not an image");
    }
  }
}
