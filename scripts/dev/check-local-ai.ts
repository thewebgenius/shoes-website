import fs from "node:fs";
import sharp from "sharp";
import { LocalFeatureEmbeddingProvider, LocalImageEnhancementProvider } from "../../src/server/ai/local/providers";
const dir = "/home/claude/stridehaus/seed-assets/images/";
(async () => {
  const p = new LocalFeatureEmbeddingProvider();
  const names = fs.readdirSync(dir).filter((f) => !f.includes("-side")).map((f) => f.replace(".png", ""));
  const idx: Record<string, number[]> = {};
  for (const n of names) idx[n] = await p.embed(fs.readFileSync(dir + n + ".png"));
  const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
  let hits = 0;
  for (const n of names) {
    // query: side view on a beige noisy background, flipped
    const side = await sharp(dir + n + "-side.png").flop().toBuffer();
    const q = await sharp({ create: { width: 1300, height: 1100, channels: 3, background: "#d8d0c4" } }).composite([{ input: await sharp(side).resize(900).toBuffer(), left: 200, top: 120 , blend: "multiply"}]).png().toBuffer();
    const e = await p.embed(q);
    const ranked = names.map((m) => [m, cos(e, idx[m])] as const).sort((a, b) => b[1] - a[1]);
    const rank = ranked.findIndex(([m]) => m === n);
    if (rank < 5) hits++;
    console.log(n.padEnd(26), "rank", rank, "top:", ranked.slice(0, 3).map(([m, s]) => `${m}:${s.toFixed(3)}`).join(" "));
  }
  console.log("top5 hits", hits, "/", names.length);
  const enh = new LocalImageEnhancementProvider();
  const q = await sharp({ create: { width: 1300, height: 1000, channels: 3, background: "#cfc6b8" } }).composite([{ input: await sharp(dir + "chelsea-tan.png").resize(800).toBuffer(), left: 250, top: 100, blend: "multiply" }]).png().toBuffer();
  fs.writeFileSync("/tmp/claude-0/t/raw.png", q);
  const r = await enh.enhance(q);
  fs.writeFileSync("/tmp/claude-0/t/processed.png", r.processed);
  fs.writeFileSync("/tmp/claude-0/t/cutout.png", r.cutout);
  console.log(r.steps, r.warnings);
})();
