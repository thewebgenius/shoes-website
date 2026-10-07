/**
 * npm run ai:check
 *
 * Checks the AI settings in .env.local with one cheap, read-only request per
 * provider (no image is generated and no credits are spent). Prints OK or the
 * problem for each one. Never prints a key.
 */

type Result = { name: string; ok: boolean; message: string };

const TIMEOUT_MS = 15_000;

async function get(url: string, headers: Record<string, string>) {
  return fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
}

function networkProblem(err: unknown) {
  const e = err as { name?: string; cause?: { code?: string } };
  if (e?.name === "TimeoutError") return "no answer within 15 seconds (network or firewall?)";
  return `could not reach the provider (${e?.cause?.code ?? e?.name ?? "network error"})`;
}

async function checkPhotoroom(): Promise<Result> {
  const name = "Background removal (Photoroom)";
  const provider = process.env.IMAGE_ENHANCEMENT_PROVIDER;
  const key = process.env.IMAGE_ENHANCEMENT_API_KEY;
  if (provider !== "photoroom") return { name, ok: false, message: `IMAGE_ENHANCEMENT_PROVIDER is "${provider ?? ""}", set it to photoroom` };
  if (!key) return { name, ok: false, message: "IMAGE_ENHANCEMENT_API_KEY is empty" };
  try {
    const res = await get("https://image-api.photoroom.com/v2/account", { "x-api-key": key });
    if (res.status === 401 || res.status === 403) return { name, ok: false, message: "the key was rejected, copy it again from the Photoroom dashboard" };
    if (!res.ok) return { name, ok: false, message: `unexpected answer HTTP ${res.status}` };
    const sandbox = key.startsWith("sandbox_") ? " (sandbox key: results are watermarked)" : "";
    return { name, ok: true, message: `key accepted${sandbox}` };
  } catch (err) {
    return { name, ok: false, message: networkProblem(err) };
  }
}

async function checkAnthropic(): Promise<Result> {
  const name = "Product details (Claude vision)";
  const provider = process.env.METADATA_PROVIDER;
  const key = process.env.METADATA_API_KEY;
  const model = process.env.METADATA_MODEL || "claude-sonnet-5-5";
  if (provider !== "anthropic") return { name, ok: false, message: `METADATA_PROVIDER is "${provider ?? ""}", set it to anthropic` };
  if (!key) return { name, ok: false, message: "METADATA_API_KEY is empty" };
  try {
    const res = await get(`https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`, { "x-api-key": key, "anthropic-version": "2023-06-01" });
    if (res.status === 401 || res.status === 403) return { name, ok: false, message: "the key was rejected, create a new one at console.anthropic.com" };
    if (res.status === 404) return { name, ok: false, message: `key accepted, but model "${model}" was not found; check METADATA_MODEL` };
    if (!res.ok) return { name, ok: false, message: `unexpected answer HTTP ${res.status}` };
    return { name, ok: true, message: `key accepted, model ${model} available` };
  } catch (err) {
    return { name, ok: false, message: networkProblem(err) };
  }
}

async function checkFashn(): Promise<Result> {
  const name = "Virtual try-on (FASHN Try-On Max)";
  const provider = process.env.TRYON_PROVIDER;
  const key = process.env.VIRTUAL_TRYON_API_KEY || process.env.TRYON_API_KEY;
  if (provider !== "fashn") return { name, ok: false, message: `TRYON_PROVIDER is "${provider ?? ""}", set it to fashn` };
  if (!key) return { name, ok: false, message: "VIRTUAL_TRYON_API_KEY is empty" };
  try {
    // Asking for the status of a prediction that does not exist costs nothing:
    // a bad key answers 401, a good key answers 404 (or similar).
    const res = await get("https://api.fashn.ai/v1/status/ai-check-00000000", { authorization: `Bearer ${key}` });
    if (res.status === 401 || res.status === 403) return { name, ok: false, message: "the key was rejected, copy it again from app.fashn.ai (Developer API)" };
    if (res.status >= 500) return { name, ok: false, message: `FASHN answered HTTP ${res.status}, try again later` };
    return { name, ok: true, message: `key accepted, output size ${process.env.TRYON_RESOLUTION || "2k"}` };
  } catch (err) {
    return { name, ok: false, message: networkProblem(err) };
  }
}

async function main() {
  if (process.env.AI_ALLOW_MOCK_PROVIDERS === "true") {
    console.log("Warning: AI_ALLOW_MOCK_PROVIDERS=true is set. Remove it so the site never shows the development mock.\n");
  }
  const results = await Promise.all([checkPhotoroom(), checkAnthropic(), checkFashn()]);
  for (const r of results) console.log(`${r.ok ? "OK     " : "PROBLEM"}  ${r.name}: ${r.message}`);
  const bad = results.filter((r) => !r.ok).length;
  console.log(bad ? `\n${bad} provider(s) need attention. Fix .env.local, then restart npm run dev.` : "\nAll three AI providers are ready. Restart npm run dev if it was already running.");
  process.exitCode = bad ? 1 : 0;
}

void main();
