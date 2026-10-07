import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalFeatureEmbeddingProvider } from "@/server/ai/local/providers";

const img = (name: string) => fs.readFileSync(path.resolve(__dirname, "../../seed-assets/images", name));
const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / Math.sqrt(na * nb);
};

describe("local visual-search embedding", () => {
  const provider = new LocalFeatureEmbeddingProvider();

  it("produces a 512-dimension vector matching the database column", async () => {
    const v = await provider.embed(img("aero-runner-cobalt.png"));
    expect(v).toHaveLength(512);
    expect(v.every(Number.isFinite)).toBe(true);
  });

  it("ranks the same shoe above a different style", async () => {
    const files = fs.readdirSync(path.resolve(__dirname, "../../seed-assets/images")).filter((f) => f.endsWith("-side.png"));
    const chelsea = files.find((f) => f.startsWith("chelsea"))!;
    const runner = files.find((f) => f.startsWith("aero-runner"))!;
    const query = await provider.embed(img(chelsea));
    const same = await provider.embed(img(chelsea.replace("-side", "")));
    const other = await provider.embed(img(runner));
    expect(cosine(query, same)).toBeGreaterThan(cosine(query, other));
  });
});
