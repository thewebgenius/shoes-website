/**
 * Calls the REAL Anthropic API with a deliberately invalid key and checks the
 * app turns the vendor's 401 into a clear "rejected the API key" error.
 * Skipped automatically when the network can't reach the API.
 */
import { describe, expect, it } from "vitest";
import { AnthropicVisionMetadataProvider } from "@/server/ai/providers/anthropic";

const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const reachable = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: AbortSignal.timeout(8000) })
  .then(() => true)
  .catch(() => false);

describe.skipIf(!reachable || process.env.SKIP_LIVE_TESTS === "1")("live provider check (no key needed)", () => {
  it("reports an invalid Anthropic key clearly", async () => {
    const p = new AnthropicVisionMetadataProvider("sk-ant-api03-invalid-key-for-testing", "claude-sonnet-5-5");
    const err = await p.suggest({ cutout: pixel }).catch((e) => e);
    expect(err.code).toBe("auth");
    expect(err.httpStatus).toBe(401);
    expect(err.userMessage).toBe("The AI provider rejected the API key. Check the key in the server environment.");
    expect(err.message).not.toContain("invalid-key-for-testing");
  });
});
