import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { ProviderError } from "../errors";
import { compressForUpload } from "../image-utils";
import { providerFetch } from "../resilience";
import { CONFIDENCE_THRESHOLD, type MetadataSuggestion, type MetadataSuggestionProvider, type Suggested } from "../types";

/**
 * Claude vision (Anthropic Messages API) for product metadata suggestions.
 *
 * Docs: https://docs.anthropic.com/en/api/messages
 *   POST https://api.anthropic.com/v1/messages
 *   headers  x-api-key, anthropic-version: 2023-06-01
 *   images as base64 content blocks; a forced tool call returns structured JSON.
 *
 * Anthropic does not train on API inputs by default (commercial terms).
 * Suggestions are never published by themselves: the shopkeeper verifies every field.
 */

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 60_000;
/** Brand and model are only suggested at or above this confidence; otherwise null. */
const BRAND_CONFIDENCE = 0.8;

const field = (values?: string[]) => ({
  type: "object",
  properties: {
    value: values ? { type: ["string", "null"], enum: [...values, null] } : { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string" },
  },
  required: ["value", "confidence"],
});

const TOOL = {
  name: "record_shoe_metadata",
  description: "Record catalogue metadata for the single shoe shown in the photos.",
  input_schema: {
    type: "object",
    properties: {
      shoeType: field(),
      category: field(["men", "women", "kids"]),
      gender: field(["male", "female", "unisex"]),
      color: field(),
      secondaryColors: field(),
      style: field(),
      description: field(),
      brand: field(),
      model: field(),
      needsVerification: { type: "boolean" },
      cutoutIssues: { type: "array", items: { type: "string" } },
    },
    required: ["shoeType", "category", "gender", "color", "secondaryColors", "style", "description", "brand", "model", "needsVerification", "cutoutIssues"],
  },
} as const;

const PROMPT = `You are helping a shoe shop in Nepal write catalogue details. Image 1 is the shopkeeper's original photo. Image 2 is the same shoe after automatic background removal (shown on a light grey backdrop).

Fill in record_shoe_metadata. Rules:
- shoeType: a short common name, e.g. "Running sneaker", "Chelsea boot", "Hiking boot", "Sandal", "Ballet flat", "School shoe", "Loafer", "High heel".
- category: the showroom section: "men", "women" or "kids". Kids only when the shoe is clearly a child's (proportions, velcro, size cues). If you cannot tell, value null.
- gender: "male", "female" or "unisex".
- color: the main colour as a shopper would say it, e.g. "Off-white". secondaryColors: other visible colours, comma separated, or null.
- style: e.g. "Casual", "Athletic", "Formal", "Outdoor", "Streetwear".
- description: 1-2 factual sentences about what is visible (materials, sole, closure). No marketing claims, no fit, comfort or size claims.
- brand and model: only if a logo or text is clearly legible or the design is unmistakable. Otherwise value null with confidence 0. Never guess.
- confidence: your honest probability that the value is correct (0-1).
- needsVerification: true if any field is uncertain.
- cutoutIssues: compare image 2 with image 1. List problems in image 2 such as "hand still visible", "floor left under the sole", "part of the heel missing", "laces cut off", "two shoes but one is cut". Empty list if the cutout is clean.`;

const suggestedSchema = z.object({ value: z.string().nullable(), confidence: z.number().min(0).max(1), reason: z.string().optional() });
const outputSchema = z.object({
  shoeType: suggestedSchema,
  category: suggestedSchema,
  gender: suggestedSchema,
  color: suggestedSchema,
  secondaryColors: suggestedSchema,
  style: suggestedSchema,
  description: suggestedSchema,
  brand: suggestedSchema,
  model: suggestedSchema,
  needsVerification: z.boolean(),
  cutoutIssues: z.array(z.string()).default([]),
});

function clean<T extends string>(s: z.infer<typeof suggestedSchema>, allowed?: readonly T[], max = 400): Suggested<T> {
  let value = s.value?.trim().slice(0, max) || null;
  if (value && allowed) {
    const lower = value.toLowerCase() as T;
    value = allowed.includes(lower) ? lower : null;
  }
  return { value: value as T | null, confidence: value ? s.confidence : 0, reason: s.reason?.slice(0, 300) };
}

/** Converts the model's raw tool input into a MetadataSuggestion, enforcing the rules above. */
export function normaliseMetadata(raw: unknown, provider = "anthropic"): MetadataSuggestion {
  const parsed = outputSchema.safeParse(raw);
  if (!parsed.success) throw new ProviderError(provider, "bad_response", "metadata did not match the schema");
  const o = parsed.data;
  const strict = (s: Suggested<string>) => (s.value && s.confidence >= BRAND_CONFIDENCE ? s : { value: null, confidence: 0, reason: s.reason ?? "Not confident enough to name it." });
  const out = {
    shoeType: clean(o.shoeType, undefined, 60),
    category: clean(o.category, ["men", "women", "kids"] as const),
    gender: clean(o.gender, ["male", "female", "unisex"] as const),
    color: clean(o.color, undefined, 60),
    secondaryColors: clean(o.secondaryColors, undefined, 120),
    style: clean(o.style, undefined, 60),
    description: clean(o.description, undefined, 2000),
    brand: strict(clean(o.brand, undefined, 60)),
    model: strict(clean(o.model, undefined, 80)),
    cutoutIssues: o.cutoutIssues.map((s) => s.slice(0, 160)).slice(0, 6),
  };
  const core: Suggested<string>[] = [out.shoeType, out.category, out.gender, out.color, out.style, out.description];
  const needsVerification = o.needsVerification || core.some((s) => !s.value || s.confidence < CONFIDENCE_THRESHOLD);
  return { ...out, needsVerification } satisfies MetadataSuggestion;
}

export class AnthropicVisionMetadataProvider implements MetadataSuggestionProvider {
  readonly id: string;
  readonly label: string;
  readonly kind = "ai" as const;
  readonly isMock = false;
  readonly configured: boolean;
  readonly notConfiguredReason?: string;

  constructor(
    private apiKey: string | undefined,
    private model: string,
  ) {
    this.id = `anthropic:${model}`;
    this.label = `Claude vision (${model})`;
    this.configured = !!apiKey;
    if (!apiKey) this.notConfiguredReason = "Set METADATA_API_KEY to your Anthropic API key.";
  }

  async suggest({ cutout, original }: { cutout: Buffer; original?: Buffer }): Promise<MetadataSuggestion> {
    if (!this.apiKey) throw new ProviderError(this.id, "not_configured");
    const cutoutJpeg = await sharp(cutout).flatten({ background: "#e6e6e6" }).resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    const originalJpeg = original ? await compressForUpload(original, 1280, 85) : cutoutJpeg;
    const image = (b: Buffer) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b.toString("base64") } });

    const res = await providerFetch(this.id, ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1500,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: [image(originalJpeg), image(cutoutJpeg), { type: "text", text: PROMPT }] }],
      }),
      timeoutMs: TIMEOUT_MS,
      errorDetail: (status, body) => {
        let type: string | undefined;
        try {
          type = (JSON.parse(body) as { error?: { type?: string } }).error?.type;
        } catch {}
        // https://docs.anthropic.com/en/api/errors
        if (type === "overloaded_error" || status === 529) return { code: "upstream", detail: `HTTP ${status} ${type ?? ""}`.trim() };
        if (type === "authentication_error" || type === "permission_error") return { code: "auth", detail: `HTTP ${status} ${type}` };
        if (type === "not_found_error") return { code: "not_configured", detail: `model "${this.model}" not found (check METADATA_MODEL)` };
        if (type === "invalid_request_error" && /credit balance/i.test(body)) return { code: "quota", detail: `HTTP ${status}` };
        return { detail: `HTTP ${status}${type ? ` ${type}` : ""}` };
      },
    });
    const json = (await res.json().catch(() => null)) as { content?: Array<{ type: string; name?: string; input?: unknown }> } | null;
    const call = json?.content?.find((c) => c.type === "tool_use" && c.name === TOOL.name);
    if (!call) throw new ProviderError(this.id, "bad_response", "no structured metadata in response");
    return normaliseMetadata(call.input, this.id);
  }
}
