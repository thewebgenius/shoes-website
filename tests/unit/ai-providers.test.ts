/**
 * Contract tests for the real-provider adapters. `fetch` is replaced with
 * responses shaped like each vendor's documented API, so these tests check our
 * side of the integration (requests, parsing, error handling, framing) without
 * a paid key. They do NOT prove the vendor's model quality; that needs a real
 * key (see README "Verifying with real keys").
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoroomImageEnhancementProvider } from "@/server/ai/providers/photoroom";
import { AnthropicVisionMetadataProvider, normaliseMetadata } from "@/server/ai/providers/anthropic";
import { FOOTWEAR_PROMPT, FashnVirtualTryOnProvider } from "@/server/ai/providers/fashn";
import { ProviderError } from "@/server/ai/errors";
import { withRetry } from "@/server/ai/resilience";
import { DEFAULT_PLACEMENT } from "@/server/ai/types";

const seed = (name: string) => fs.readFileSync(path.resolve(__dirname, "../../seed-assets/images", name));

type Call = { url: string; init: RequestInit };
function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function photo(width: number, height: number, colour = "#8aa1b1") {
  return sharp({ create: { width, height, channels: 3, background: colour } }).jpeg().toBuffer();
}

/** A centred opaque blob on a transparent 1200 canvas: what Photoroom returns for a product. */
async function transparentResult() {
  const shoe = await sharp(seed("trail-hiker-olive.png")).resize(900, 900, { fit: "inside" }).png().toBuffer();
  return sharp({ create: { width: 1200, height: 1200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shoe, gravity: "centre" }])
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------

describe("Photoroom background removal", () => {
  it("sends the documented v2/edit request and returns a transparent, centred image and a tight cutout", async () => {
    const result = await transparentResult();
    const calls = stubFetch(() => new Response(new Uint8Array(result), { status: 200, headers: { "content-type": "image/png" } }));
    const p = new PhotoroomImageEnhancementProvider("live_test_key");
    const out = await p.enhance(await photo(2000, 1500));

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://image-api.photoroom.com/v2/edit");
    expect((calls[0].init.headers as Record<string, string>)["x-api-key"]).toBe("live_test_key");
    const form = calls[0].init.body as FormData;
    expect(form.get("padding")).toBe("0.1");
    expect(form.get("outputSize")).toBe("1200x1200");
    expect(form.get("export.format")).toBe("png");
    expect(form.get("background.color")).toBeNull(); // transparent
    expect(form.get("imageFile")).toBeInstanceOf(Blob);

    const pm = await sharp(out.processed).metadata();
    expect([pm.width, pm.height, pm.hasAlpha]).toEqual([1200, 1200, true]);
    const cm = await sharp(out.cutout).metadata();
    expect(Math.max(cm.width!, cm.height!)).toBeLessThanOrEqual(900);
    expect(out.warnings).toEqual([]);
  });

  it("compresses large photos before sending", async () => {
    const result = await transparentResult();
    const calls = stubFetch(() => new Response(new Uint8Array(result)));
    await new PhotoroomImageEnhancementProvider("k").enhance(await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#777" } }).png().toBuffer());
    const sent = Buffer.from(await ((calls[0].init.body as FormData).get("imageFile") as Blob).arrayBuffer());
    const m = await sharp(sent).metadata();
    expect(m.format).toBe("jpeg");
    expect(Math.max(m.width!, m.height!)).toBeLessThanOrEqual(2500);
  });

  it("flags sandbox keys because the result is watermarked", async () => {
    const result = await transparentResult();
    stubFetch(() => new Response(new Uint8Array(result)));
    const out = await new PhotoroomImageEnhancementProvider("sandbox_abc").enhance(await photo(800, 800));
    expect(out.warnings.join(" ")).toMatch(/watermark/);
  });

  it("refuses a result without transparency instead of calling it a success", async () => {
    stubFetch(async () => new Response(new Uint8Array(await sharp({ create: { width: 1200, height: 1200, channels: 3, background: "#fff" } }).png().toBuffer())));
    await expect(new PhotoroomImageEnhancementProvider("k").enhance(await photo(800, 800))).rejects.toMatchObject({ code: "bad_response" });
  });

  it.each([
    [402, { error: { detail: "No credits" } }, "quota"],
    [403, { error: { message: "Invalid API key" } }, "auth"],
    [401, { error: { message: "Unauthorized" } }, "auth"],
    [400, { error: { message: "Image could not be decoded" } }, "invalid_input"],
    [429, {}, "rate_limited"],
    [500, { error: { message: "boom" } }, "upstream"],
  ])("maps HTTP %i to %s", async (status, body, code) => {
    stubFetch(() => jsonRes(body, status));
    const err = await new PhotoroomImageEnhancementProvider("bad-key").enhance(await photo(400, 400)).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe(code);
    expect(err.message).not.toContain("bad-key");
  });

  it("is 'not configured' without a key and makes no request", async () => {
    const calls = stubFetch(() => jsonRes({}));
    const p = new PhotoroomImageEnhancementProvider(undefined);
    expect(p.configured).toBe(false);
    await expect(p.enhance(await photo(100, 100))).rejects.toMatchObject({ code: "not_configured", userMessage: "AI provider not configured." });
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

const toolResponse = (input: unknown) =>
  jsonRes({ id: "msg_1", type: "message", role: "assistant", content: [{ type: "tool_use", id: "tu_1", name: "record_shoe_metadata", input }], stop_reason: "tool_use" });

const s = (value: string | null, confidence: number) => ({ value, confidence, reason: "seen in photo" });
const shoe = (o: Partial<Record<string, unknown>>) => ({
  shoeType: s("Sneaker", 0.9),
  category: s("men", 0.7),
  gender: s("unisex", 0.7),
  color: s("White", 0.9),
  secondaryColors: s(null, 0),
  style: s("Casual", 0.8),
  description: s("Low-top lace-up sneaker with a white rubber sole.", 0.85),
  brand: s(null, 0),
  model: s(null, 0),
  needsVerification: false,
  cutoutIssues: [],
  ...o,
});

describe("Claude vision metadata", () => {
  it("sends both images with a forced tool call and parses the structured result", async () => {
    const calls = stubFetch(() => toolResponse(shoe({})));
    const p = new AnthropicVisionMetadataProvider("sk-ant-test", "claude-sonnet-5-5");
    const out = await p.suggest({ cutout: await transparentResult(), original: await photo(1600, 1200) });

    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.tool_choice).toEqual({ type: "tool", name: "record_shoe_metadata" });
    expect(body.messages[0].content.filter((c: { type: string }) => c.type === "image")).toHaveLength(2);
    expect(out.shoeType.value).toBe("Sneaker");
    expect(out.needsVerification).toBe(false);
  });

  it.each([
    ["chelsea boot", shoe({ shoeType: s("Chelsea boot", 0.92), color: s("Tan", 0.9), style: s("Smart casual", 0.7) }), { shoeType: "Chelsea boot", category: "men" }],
    ["women's heel", shoe({ shoeType: s("High heel", 0.9), category: s("Women", 0.85), gender: s("female", 0.85), style: s("Formal", 0.8) }), { shoeType: "High heel", category: "women" }],
    ["kids' velcro", shoe({ shoeType: s("School shoe", 0.8), category: s("kids", 0.9), gender: s("unisex", 0.8) }), { shoeType: "School shoe", category: "kids" }],
    ["sandal", shoe({ shoeType: s("Sandal", 0.88), category: s(null, 0) }), { shoeType: "Sandal", category: null }],
  ])("normalises a %s", (_name, raw, expected) => {
    const out = normaliseMetadata(raw);
    expect(out.shoeType.value).toBe(expected.shoeType);
    expect(out.category.value).toBe(expected.category);
    if (expected.category === null) expect(out.needsVerification).toBe(true);
  });

  it("keeps brand and model null unless the model is confident", () => {
    const weak = normaliseMetadata(shoe({ brand: s("Nike", 0.55), model: s("Air Force 1", 0.4) }));
    expect(weak.brand?.value).toBeNull();
    expect(weak.model?.value).toBeNull();
    const strong = normaliseMetadata(shoe({ brand: s("Nike", 0.95), model: s("Air Force 1", 0.85) }));
    expect(strong.brand?.value).toBe("Nike");
    expect(strong.model?.value).toBe("Air Force 1");
  });

  it("drops categories outside Men/Women/Kids and marks low confidence for verification", () => {
    const out = normaliseMetadata(shoe({ category: s("unisex adults", 0.9), color: s("Black", 0.3) }));
    expect(out.category.value).toBeNull();
    expect(out.needsVerification).toBe(true);
  });

  it("reports cutout problems the model saw", () => {
    const out = normaliseMetadata(shoe({ cutoutIssues: ["hand still visible", "floor left under the sole"] }));
    expect(out.cutoutIssues).toEqual(["hand still visible", "floor left under the sole"]);
  });

  it("rejects malformed output instead of inventing values", () => {
    expect(() => normaliseMetadata({ shoeType: "Sneaker" })).toThrow(ProviderError);
  });

  it("turns an invalid key into a clear auth error", async () => {
    stubFetch(() => jsonRes({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401));
    const err = await new AnthropicVisionMetadataProvider("sk-ant-wrong", "claude-sonnet-5-5").suggest({ cutout: await transparentResult() }).catch((e) => e);
    expect(err.code).toBe("auth");
    expect(err.userMessage).toMatch(/rejected the API key/);
    expect(err.retryable).toBe(false);
  });

  it("treats 529 overloaded as retryable", async () => {
    stubFetch(() => jsonRes({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, 529));
    const err = await new AnthropicVisionMetadataProvider("k", "m").suggest({ cutout: await transparentResult() }).catch((e) => e);
    expect(err.code).toBe("upstream");
    expect(err.retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------

function fashnStub(opts: { output?: (person: Buffer) => Promise<string>; fail?: { name: string }; runStatus?: number; runBody?: unknown } = {}) {
  let person: Buffer | null = null;
  let polls = 0;
  const calls = stubFetch(async (url, init) => {
    if (url.endsWith("/v1/run")) {
      if (opts.runStatus) return jsonRes(opts.runBody ?? {}, opts.runStatus);
      const body = JSON.parse(String(init.body));
      person = Buffer.from(body.inputs.model_image.replace(/^data:image\/jpeg;base64,/, ""), "base64");
      return jsonRes({ id: "pred-123", error: null });
    }
    polls++;
    if (polls < 2) return jsonRes({ id: "pred-123", status: "processing", output: null, error: null });
    if (opts.fail) return jsonRes({ id: "pred-123", status: "failed", output: null, error: { name: opts.fail.name, message: "x" } });
    const out = opts.output ? await opts.output(person!) : `data:image/jpeg;base64,${(await sharp(person!).jpeg().toBuffer()).toString("base64")}`;
    return jsonRes({ id: "pred-123", status: "completed", output: [out], error: null });
  });
  return calls;
}

const tryOnInput = async (w: number, h: number) => ({
  personImage: await photo(w, h),
  productImage: await transparentResult(),
  productName: "Trail Hiker",
  placement: DEFAULT_PLACEMENT,
});

describe("FASHN Try-On Max", () => {
  const fast = { pollEveryMs: 1, timeoutMs: 5_000 };

  it("calls /v1/run with tryon-max, data URIs and return_base64, then polls /v1/status", async () => {
    const calls = fashnStub();
    const p = new FashnVirtualTryOnProvider("fa-test", fast);
    expect(p.usesPlacement).toBe(false);
    await p.tryOn(await tryOnInput(900, 1200));
    expect(calls[0].url).toBe("https://api.fashn.ai/v1/run");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer fa-test");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.model_name).toBe("tryon-max");
    expect(body.inputs.return_base64).toBe(true);
    expect(body.inputs.model_image).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.inputs.product_image).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.inputs.prompt).toBe(FOOTWEAR_PROMPT);
    expect(body.inputs.prompt).toMatch(/Keep the exact framing/);
    expect(calls.slice(1).every((c) => c.url === "https://api.fashn.ai/v1/status/pred-123")).toBe(true);
  });

  // Framing: we never crop the customer's photo, so a feet-only photo goes to the
  // model as feet-only, and the model's output is returned as-is (no re-crop).
  it.each([
    ["feet only", 1600, 900],
    ["lower body", 1000, 1400],
    ["full body", 900, 1800],
  ])("keeps the %s framing of the photo (%ix%i)", async (_name, w, h) => {
    let sentAspect = 0;
    fashnStub({
      output: async (person) => {
        const m = await sharp(person).metadata();
        sentAspect = m.width! / m.height!;
        return (await sharp(person).jpeg().toBuffer()).toString("base64"); // plain base64 is accepted too
      },
    });
    const { image } = await new FashnVirtualTryOnProvider("k", fast).tryOn(await tryOnInput(w, h));
    expect(sentAspect).toBeCloseTo(w / h, 2);
    const out = await sharp(image).metadata();
    expect(out.width! / out.height!).toBeCloseTo(w / h, 2);
  });

  it("compresses the photo to at most 2048px before sending", async () => {
    let longest = 0;
    fashnStub({
      output: async (person) => {
        const m = await sharp(person).metadata();
        longest = Math.max(m.width!, m.height!);
        return (await sharp(person).jpeg().toBuffer()).toString("base64");
      },
    });
    await new FashnVirtualTryOnProvider("k", fast).tryOn(await tryOnInput(3000, 4000));
    expect(longest).toBeLessThanOrEqual(2048);
  });

  it("maps a moderation failure to content_rejected without retrying", async () => {
    const calls = fashnStub({ fail: { name: "ContentModerationError" } });
    const err = await new FashnVirtualTryOnProvider("k", fast).tryOn(await tryOnInput(800, 1000)).catch((e) => e);
    expect(err.code).toBe("content_rejected");
    expect(calls.filter((c) => c.url.endsWith("/run"))).toHaveLength(1);
  });

  it("reports an invalid key clearly", async () => {
    fashnStub({ runStatus: 401, runBody: { error: "UnauthorizedAccess" } });
    const err = await new FashnVirtualTryOnProvider("wrong", fast).tryOn(await tryOnInput(800, 1000)).catch((e) => e);
    expect(err.code).toBe("auth");
    expect(err.userMessage).toMatch(/rejected the API key/);
  });

  it("treats OutOfCredits (HTTP 429) as quota, not as a retryable rate limit", async () => {
    const calls = fashnStub({ runStatus: 429, runBody: { error: "OutOfCredits" } });
    const err = await new FashnVirtualTryOnProvider("k", fast).tryOn(await tryOnInput(800, 1000)).catch((e) => e);
    expect(err.code).toBe("quota");
    expect(calls).toHaveLength(1);
  });

  it("refuses output that is not an image", async () => {
    fashnStub({ output: async () => Buffer.from("not an image").toString("base64") });
    await expect(new FashnVirtualTryOnProvider("k", fast).tryOn(await tryOnInput(800, 1000))).rejects.toMatchObject({ code: "bad_response" });
  });
});

// ---------------------------------------------------------------------------

describe("retry policy", () => {
  const policy = { retries: 2, baseDelayMs: 1, maxDelayMs: 5 };

  it("retries transient errors and reports each retry", async () => {
    const seen: number[] = [];
    let n = 0;
    const out = await withRetry(
      "test",
      "p",
      async () => {
        if (++n < 3) throw new ProviderError("p", "upstream");
        return "ok";
      },
      { policy, onRetry: (a) => void seen.push(a) },
    );
    expect(out).toBe("ok");
    expect(seen).toEqual([1, 2]);
  });

  it("does not retry a bad key", async () => {
    let n = 0;
    await expect(
      withRetry(
        "test",
        "p",
        async () => {
          n++;
          throw new ProviderError("p", "auth");
        },
        { policy },
      ),
    ).rejects.toMatchObject({ code: "auth" });
    expect(n).toBe(1);
  });

  it("gives up after the configured retries", async () => {
    let n = 0;
    await expect(
      withRetry(
        "test",
        "p",
        async () => {
          n++;
          throw new ProviderError("p", "timeout");
        },
        { policy },
      ),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(n).toBe(3);
  });

  it("never logs keys or image data", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubFetch(() => jsonRes({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401));
    const p = new AnthropicVisionMetadataProvider("sk-ant-SECRET-123", "m");
    await withRetry("metadata", p.id, () => p.suggest({ cutout: transparentPixel }), { policy }).catch(() => undefined);
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("auth");
    expect(logged).not.toContain("SECRET");
    expect(logged).not.toMatch(/base64|\/9j\//);
    log.mockRestore();
  });
});

const transparentPixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
