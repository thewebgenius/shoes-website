import sharp from "sharp";
import {
  CONFIDENCE_THRESHOLD,
  ProviderUnavailableError,
  type EmbeddingProvider,
  type EnhancementResult,
  type ImageEnhancementProvider,
  type MetadataSuggestion,
  type MetadataSuggestionProvider,
  type ThreeDGenerationProvider,
  type TryOnInput,
  type VirtualTryOnProvider,
} from "../types";
import { composeOnCanvas, cutoutFromSegmentation, dominantColours, segment } from "./image-ops";

/**
 * Local development providers. None of these call an AI model; they use
 * classical image processing so the full workflow runs offline. Each one is
 * flagged isMock = true and the UI says so.
 */

// ---------------------------------------------------------------------------
// Image enhancement: background removal → enhancement → crop/resize
// ---------------------------------------------------------------------------

export class LocalImageEnhancementProvider implements ImageEnhancementProvider {
  readonly id = "local-basic-v1";
  readonly label = "Local basic processor (development, not AI)";
  readonly isMock = true;

  async enhance(input: Buffer): Promise<EnhancementResult> {
    const warnings: string[] = [];
    const steps: EnhancementResult["steps"] = [];
    const seg = await segment(input);
    if (seg.foregroundShare > 0.92) warnings.push("Background could not be separated cleanly. Try a plain, evenly lit background.");
    if (seg.foregroundShare < 0.02) warnings.push("The shoe appears very small in the photo. Move closer or crop before uploading.");
    steps.push({
      name: "Background removal",
      detail: seg.hasAlpha ? "Used the image's existing transparency." : `Separated the subject from a background of rgb(${seg.background.join(", ")}).`,
    });

    let cutout = await cutoutFromSegmentation(input, seg);
    const cm = await sharp(cutout).metadata();
    const longest = Math.max(cm.width ?? 0, cm.height ?? 0);
    // Gentle, appearance-preserving enhancement: auto-levels + light sharpening.
    cutout = await sharp(cutout).normalise({ lower: 1, upper: 99.5 }).sharpen({ sigma: 0.7, m1: 0.5, m2: 1.5 }).png().toBuffer();
    steps.push({ name: "Enhancement", detail: "Auto-levels and light sharpening. Colours and shape are not altered." });
    if (longest < 1000) {
      steps.push({ name: "Upscaling", detail: `Upscaled from ${longest}px with Lanczos resampling (classical, not AI super-resolution).` });
      if (longest < 500) warnings.push("Source photo is low resolution; the result may look soft.");
    }
    const processed = await composeOnCanvas(cutout, 1200);
    steps.push({ name: "Crop & resize", detail: "Centred on a 1200×1200 transparent canvas." });
    return { processed, cutout, steps, warnings };
  }
}

// ---------------------------------------------------------------------------
// Metadata suggestion
// ---------------------------------------------------------------------------

export class LocalMetadataProvider implements MetadataSuggestionProvider {
  readonly id = "local-heuristic-v1";
  readonly label = "Local heuristics (development, not AI)";
  readonly isMock = true;

  async suggest(cutout: Buffer): Promise<MetadataSuggestion> {
    const colours = await dominantColours(cutout);
    const [first, second] = colours;
    let color: MetadataSuggestion["color"] = { value: null, confidence: 0, reason: "No dominant colour found." };
    if (first) {
      const twoTone = second && second.share > 0.22;
      color = {
        value: twoTone ? `${first.name} / ${second.name}` : first.name,
        confidence: Math.min(0.95, first.share + (twoTone ? second.share * 0.6 : 0)),
        reason: `Largest colour areas: ${colours
          .slice(0, 3)
          .map((c) => `${c.name} ${(c.share * 100).toFixed(0)}%`)
          .join(", ")}.`,
      };
    }

    const m = await sharp(cutout).metadata();
    const ratio = (m.height ?? 1) / (m.width ?? 1);
    let shoeType: MetadataSuggestion["shoeType"];
    if (ratio > 0.8) shoeType = { value: "Boot", confidence: 0.45, reason: "Tall silhouette." };
    else if (ratio > 0.42) shoeType = { value: "Sneaker", confidence: 0.35, reason: "Mid-height silhouette; could also be a casual shoe." };
    else shoeType = { value: "Flat / Sandal", confidence: 0.3, reason: "Low silhouette." };

    return {
      shoeType,
      color,
      category: { value: null, confidence: 0, reason: "Cannot tell men's, women's or kids' sizing from a photo." },
      gender: { value: null, confidence: 0, reason: "Not inferable from the local heuristics." },
      description: {
        value: color.value && shoeType.value ? `${color.value} ${shoeType.value.toLowerCase()}.` : null,
        confidence: Math.min(color.confidence, shoeType.confidence, CONFIDENCE_THRESHOLD - 0.01),
        reason: "Draft only. Please write the real description.",
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Embeddings for visual search (colour + shape + edge features, 512-d)
// ---------------------------------------------------------------------------

const GRID = 32;

function l2(v: number[]) {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r / 255) h = ((g - b) / 255 / d) % 6;
    else if (max === g / 255) h = (b - r) / 255 / d + 2;
    else h = (r - g) / 255 / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

export class LocalFeatureEmbeddingProvider implements EmbeddingProvider {
  readonly id = "local-features-v1";
  readonly label = "Local colour/shape features (development, not AI)";
  readonly isMock = true;
  readonly model = "local-features-v1";
  readonly dimensions = 512;

  /** Accepts a raw photo or a cutout; segments, crops and describes the shoe. */
  async embed(image: Buffer): Promise<number[]> {
    const seg = await segment(image);
    const cutout = await cutoutFromSegmentation(image, seg);
    const { data } = await sharp(cutout)
      .resize(GRID, GRID, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // 1) Colour: HSV histogram over foreground (12 hue x 3 sat x 3 val) + 8 grey bins = 116
    const colour = new Array(116).fill(0);
    // 2) Shape: mirrored-symmetric 16x16 occupancy, keep left half = 128
    const occ = new Array(GRID * GRID).fill(0);
    // 3) Edges: 4x4 cells x 8 orientation bins on luminance, mirror-averaged = 128
    const lum = new Float32Array(GRID * GRID);
    for (let i = 0; i < GRID * GRID; i++) {
      const a = data[i * 4 + 3] / 255;
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      lum[i] = a * (0.299 * r + 0.587 * g + 0.114 * b) + (1 - a) * 255;
      occ[i] = a;
      if (a < 0.5) continue;
      const [h, s, v] = rgbToHsv(r, g, b);
      if (s < 0.15 || v < 0.12) {
        colour[108 + Math.min(7, Math.floor(v * 8))] += 1;
      } else {
        const hb = Math.min(11, Math.floor(h * 12));
        const sb = Math.min(2, Math.floor(s * 3));
        const vb = Math.min(2, Math.floor(v * 3));
        colour[hb * 9 + sb * 3 + vb] += 1;
      }
    }
    const shape: number[] = [];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 8; x++) {
        let s = 0;
        for (const xx of [x, 15 - x]) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s += occ[(y * 2 + dy) * GRID + xx * 2 + dx];
        shape.push(s / 8);
      }
    }
    const hog = (mirror: boolean) => {
      const out = new Array(128).fill(0);
      for (let y = 1; y < GRID - 1; y++) {
        for (let x = 1; x < GRID - 1; x++) {
          const X = mirror ? GRID - 1 - x : x;
          const gx = lum[y * GRID + X + (mirror ? -1 : 1)] - lum[y * GRID + X + (mirror ? 1 : -1)];
          const gy = lum[(y + 1) * GRID + X] - lum[(y - 1) * GRID + X];
          const mag = Math.hypot(gx, gy);
          if (mag < 1) continue;
          const ang = (Math.atan2(gy, gx) + Math.PI) / (2 * Math.PI);
          const bin = Math.min(7, Math.floor(ang * 8));
          const cell = Math.floor(y / 8) * 4 + Math.floor(x / 8);
          out[cell * 8 + bin] += mag;
        }
      }
      return out;
    };
    const h1 = hog(false);
    const h2 = hog(true);
    const edges = h1.map((v, i) => (v + h2[i]) / 2);
    const aspect = [seg.bbox.h / Math.max(1, seg.bbox.w)];

    const weight = (v: number[], w: number) => l2(v).map((x) => x * Math.sqrt(w));
    const vec = [
      ...weight(colour.map(Math.sqrt), 0.5),
      ...weight(shape, 0.28),
      ...weight(edges.map(Math.sqrt), 0.2),
      ...weight(aspect, 0.02),
    ];
    while (vec.length < this.dimensions) vec.push(0);
    return l2(vec.slice(0, this.dimensions));
  }
}

// ---------------------------------------------------------------------------
// 3D generation: not available in MVP (Phase 2)
// ---------------------------------------------------------------------------

export class MockThreeDGenerationProvider implements ThreeDGenerationProvider {
  readonly id = "mock-3d-unavailable";
  readonly label = "Automatic photo-to-3D (Phase 2, not configured)";
  readonly isMock = true;
  readonly available = false;
  readonly unavailableReason =
    "Automatic 3D reconstruction from photos is not part of the MVP. Upload a GLB model or assign a sample model instead.";

  async generate(): Promise<never> {
    throw new ProviderUnavailableError(this.unavailableReason);
  }
}

// ---------------------------------------------------------------------------
// Virtual try-on: development mock that composites the catalogue cutout
// ---------------------------------------------------------------------------

export class MockVirtualTryOnProvider implements VirtualTryOnProvider {
  readonly id = "mock-tryon-composite-v1";
  readonly label = "Development mock (simple overlay, no try-on model configured)";
  readonly isMock = true;

  async tryOn({ personImage, productImage, placement }: TryOnInput) {
    const base = sharp(personImage).rotate().resize(1080, 1440, { fit: "inside", withoutEnlargement: false });
    const baseBuf = await base.jpeg({ quality: 90 }).toBuffer();
    const bm = await sharp(baseBuf).metadata();
    const W = bm.width!;
    const H = bm.height!;
    const shoeW = Math.max(24, Math.min(W, Math.round(W * placement.scale)));
    const shoe = await sharp(productImage).resize({ width: shoeW, fit: "inside" }).png().toBuffer();
    const sm = await sharp(shoe).metadata();
    const shadow = await sharp(shoe)
      .ensureAlpha()
      .extractChannel(3)
      .blur(12)
      .linear(0.45, 0)
      .toBuffer()
      .then((a) =>
        sharp({ create: { width: sm.width!, height: sm.height!, channels: 3, background: "#000000" } })
          .joinChannel(a)
          .png()
          .toBuffer(),
      );
    // Centre the shoe on the point the customer chose, kept inside the frame.
    const left = Math.max(0, Math.min(W - sm.width!, Math.round(placement.x * W - sm.width! / 2)));
    const top = Math.max(0, Math.min(H - sm.height!, Math.round(placement.y * H - sm.height! / 2)));
    const banner = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Math.round(H * 0.075)}">
        <rect width="100%" height="100%" fill="rgba(17,17,17,0.72)"/>
        <text x="50%" y="62%" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(W * 0.028)}" fill="#fff">
          AI-generated visual preview · DEVELOPMENT MOCK (overlay only)
        </text></svg>`,
    );
    const image = await sharp(baseBuf)
      .composite([
        { input: shadow, left: left + 6, top: top + 14 },
        { input: shoe, left, top },
        { input: banner, left: 0, top: 0 },
      ])
      .jpeg({ quality: 85 })
      .toBuffer();
    return { image };
  }
}
