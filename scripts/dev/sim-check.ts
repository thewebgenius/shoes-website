/**
 * Prints the top catalogue matches for sample photos, to calibrate the
 * confidence gate in the visual search (MIN_SIMILARITY / MIN_MARGIN).
 * Usage: npx tsx scripts/dev/sim-check.ts <image...>
 */
import fs from "node:fs/promises";
import { LocalFeatureEmbeddingProvider } from "../../src/server/ai/local/providers";

const cosine = (a: number[], b: number[]) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] ** 2;
    nb += b[i] ** 2;
  }
  return dot / Math.sqrt(na * nb);
};

async function main() {
  const provider = new LocalFeatureEmbeddingProvider();
  const dir = "seed-assets/images";
  const catalogue = (await fs.readdir(dir)).filter((f) => !f.includes("-side"));
  const vectors = await Promise.all(catalogue.map(async (f) => [f, await provider.embed(await fs.readFile(`${dir}/${f}`))] as const));
  for (const query of process.argv.slice(2)) {
    const v = await provider.embed(await fs.readFile(query));
    const scored = vectors.map(([f, cv]) => [f, cosine(v, cv)] as const).sort((a, b) => b[1] - a[1]);
    console.log(query.split("/").pop(), "→", scored.slice(0, 3).map(([f, s]) => `${f.replace(".png", "")} ${s.toFixed(3)}`).join(" | "));
  }
}

void main();
