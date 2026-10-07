import sharp from "sharp";

/**
 * Classical (non-AI) image operations used by the local development providers:
 * background segmentation by border flood-fill, cropping and feature extraction.
 * They are deterministic and preserve the photographed shoe exactly.
 */

export type Segmentation = {
  width: number; // analysis width
  height: number;
  mask: Uint8Array; // 1 = foreground
  bbox: { x: number; y: number; w: number; h: number }; // in analysis pixels
  scale: number; // original / analysis
  foregroundShare: number;
  background: [number, number, number];
  hasAlpha: boolean;
};

const ANALYSIS_MAX = 512;

function dist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr * 0.9 + dg * dg * 1.2 + db * db * 0.9);
}

/** Sobel gradient magnitude of the (slightly blurred) greyscale image, at analysis size. */
async function gradientMagnitude(input: Buffer, w: number, h: number): Promise<Float32Array> {
  const grey = await sharp(input).resize(w, h, { fit: "fill" }).removeAlpha().greyscale().blur(0.8).raw().toBuffer();
  const out = new Float32Array(w * h);
  const at = (x: number, y: number) => grey[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      out[y * w + x] = Math.sqrt(gx * gx + gy * gy) / 4;
    }
  }
  return out;
}

export async function segment(input: Buffer): Promise<Segmentation> {
  const meta = await sharp(input).metadata();
  const ow = meta.width ?? 1;
  const oh = meta.height ?? 1;
  const scale = Math.max(ow, oh) / ANALYSIS_MAX > 1 ? Math.max(ow, oh) / ANALYSIS_MAX : 1;
  const w = Math.max(1, Math.round(ow / scale));
  const h = Math.max(1, Math.round(oh / scale));
  const { data } = await sharp(input).resize(w, h, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const n = w * h;
  const mask = new Uint8Array(n).fill(1);

  // Images that already carry transparency: alpha is the mask.
  let transparent = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 16) transparent++;
  const hasAlpha = transparent > n * 0.05;

  let bg: [number, number, number] = [255, 255, 255];
  if (hasAlpha) {
    for (let i = 0; i < n; i++) mask[i] = data[i * 4 + 3] >= 64 ? 1 : 0;
  } else {
    // Background colour = median of the border pixels.
    const border: number[][] = [];
    for (let x = 0; x < w; x++) border.push([x, 0], [x, h - 1]);
    for (let y = 0; y < h; y++) border.push([0, y], [w - 1, y]);
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];
    for (const [x, y] of border) {
      const i = (y * w + x) * 4;
      rs.push(data[i]);
      gs.push(data[i + 1]);
      bs.push(data[i + 2]);
    }
    const med = (a: number[]) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)];
    bg = [med(rs), med(gs), med(bs)];

    // Edge map. A white sole against a white backdrop is the same colour as the
    // background, so colour alone would flood straight through it; the outline
    // (contact shadow, antialiasing, material change) is what separates them.
    // The fill may not cross a pixel whose gradient is above the threshold.
    const edge = await gradientMagnitude(input, w, h);
    const T_EDGE = 11;

    // Flood fill the background from the border. A pixel joins if it is close
    // to the global background colour, or close to its already-filled neighbour
    // (follows soft gradients and shadows) without drifting too far.
    const T_GLOBAL = 34;
    const T_LOCAL = 9;
    const T_DRIFT = 90;
    const visited = new Uint8Array(n);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    for (const [x, y] of border) {
      const p = y * w + x;
      const i = p * 4;
      if (!visited[p] && dist(data[i], data[i + 1], data[i + 2], ...bg) < T_DRIFT) {
        visited[p] = 1;
        mask[p] = 0;
        queue[tail++] = p;
      }
    }
    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      const y = (p - x) / w;
      const i = p * 4;
      const nbrs = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nbrs) {
        if (q < 0 || visited[q]) continue;
        const j = q * 4;
        if (edge[q] > T_EDGE) continue;
        const dg = dist(data[j], data[j + 1], data[j + 2], ...bg);
        const dl = dist(data[j], data[j + 1], data[j + 2], data[i], data[i + 1], data[i + 2]);
        if (dg < T_GLOBAL || (dl < T_LOCAL && dg < T_DRIFT)) {
          visited[q] = 1;
          mask[q] = 0;
          queue[tail++] = q;
        }
      }
    }
  }

  // Keep the significant connected foreground components (drops dust and noise).
  const label = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack = new Int32Array(n);
  for (let p = 0; p < n; p++) {
    if (!mask[p] || label[p] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    let sp = 0;
    stack[sp++] = p;
    label[p] = id;
    while (sp) {
      const c = stack[--sp];
      size++;
      const x = c % w;
      const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w];
      for (const q of nb) {
        if (q < 0 || q >= n || !mask[q] || label[q] !== -1) continue;
        label[q] = id;
        stack[sp++] = q;
      }
    }
    sizes.push(size);
  }
  const largest = Math.max(0, ...sizes);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let fg = 0;
  for (let p = 0; p < n; p++) {
    if (!mask[p]) continue;
    if (sizes[label[p]] < largest * 0.04) {
      mask[p] = 0;
      continue;
    }
    fg++;
    const x = p % w;
    const y = (p - x) / w;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) {
    // Nothing separable from the background: treat the whole frame as the subject.
    mask.fill(1);
    minX = 0;
    minY = 0;
    maxX = w - 1;
    maxY = h - 1;
    fg = n;
  }
  return {
    width: w,
    height: h,
    mask,
    bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    scale,
    foregroundShare: fg / n,
    background: bg,
    hasAlpha,
  };
}

/** Full-resolution cutout (transparent PNG), cropped to the subject with a small margin. */
export async function cutoutFromSegmentation(input: Buffer, seg: Segmentation): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const ow = meta.width!;
  const oh = meta.height!;
  const maskImg = await sharp(Buffer.from(seg.mask.map((v) => (v ? 255 : 0))), { raw: { width: seg.width, height: seg.height, channels: 1 } })
    .resize(ow, oh, { kernel: "cubic" })
    .blur(Math.max(0.5, seg.scale * 0.6))
    .toColourspace("b-w")
    .raw()
    .toBuffer();
  const rgb = await sharp(input).removeAlpha().raw().toBuffer();
  const rgba = Buffer.alloc(ow * oh * 4);
  const hasSourceAlpha = seg.hasAlpha;
  const srcAlpha = hasSourceAlpha ? await sharp(input).ensureAlpha().extractChannel(3).raw().toBuffer() : null;
  for (let i = 0; i < ow * oh; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = srcAlpha ? Math.min(srcAlpha[i], maskImg[i]) : maskImg[i];
  }
  const pad = Math.round(Math.max(seg.bbox.w, seg.bbox.h) * seg.scale * 0.03);
  const left = Math.max(0, Math.floor(seg.bbox.x * seg.scale) - pad);
  const top = Math.max(0, Math.floor(seg.bbox.y * seg.scale) - pad);
  const right = Math.min(ow, Math.ceil((seg.bbox.x + seg.bbox.w) * seg.scale) + pad);
  const bottom = Math.min(oh, Math.ceil((seg.bbox.y + seg.bbox.h) * seg.scale) + pad);
  return sharp(rgba, { raw: { width: ow, height: oh, channels: 4 } })
    .extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) })
    .png()
    .toBuffer();
}

/**
 * Centres a cutout on a square canvas, the way catalogue photos are framed.
 * The canvas is transparent, so a white shoe keeps its shape against whatever
 * the page puts behind it instead of dissolving into a white tile.
 */
export async function composeOnCanvas(cutout: Buffer, size = 1200, fill = 0.86): Promise<Buffer> {
  const inner = Math.round(size * fill);
  const resized = await sharp(cutout).resize(inner, inner, { fit: "inside", kernel: "lanczos3" }).png().toBuffer();
  const m = await sharp(resized).metadata();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left: Math.round((size - m.width!) / 2), top: Math.round((size - m.height!) / 2) }])
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Colour naming
// ---------------------------------------------------------------------------

const NAMED: Array<[string, [number, number, number]]> = [
  ["Black", [20, 20, 22]],
  ["White", [245, 245, 242]],
  ["Grey", [140, 140, 140]],
  ["Red", [200, 30, 40]],
  ["Burgundy", [110, 25, 35]],
  ["Orange", [240, 120, 30]],
  ["Yellow", [240, 210, 40]],
  ["Green", [60, 150, 60]],
  ["Olive", [100, 105, 50]],
  ["Lime", [140, 200, 30]],
  ["Blue", [40, 90, 210]],
  ["Navy", [25, 35, 80]],
  ["Sky Blue", [90, 190, 240]],
  ["Purple", [120, 50, 170]],
  ["Magenta", [190, 40, 200]],
  ["Pink", [240, 150, 190]],
  ["Coral", [250, 120, 120]],
  ["Brown", [110, 65, 30]],
  ["Tan", [190, 140, 90]],
  ["Beige", [220, 200, 170]],
];

export async function dominantColours(cutout: Buffer): Promise<Array<{ name: string; share: number }>> {
  const { data, info } = await sharp(cutout).ensureAlpha().resize(96, 96, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  const counts = new Map<string, number>();
  let total = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    if (data[i * 4 + 3] < 200) continue;
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    let best = NAMED[0][0];
    let bd = Infinity;
    for (const [name, [nr, ng, nb]] of NAMED) {
      const d = dist(r, g, b, nr, ng, nb);
      if (d < bd) {
        bd = d;
        best = name;
      }
    }
    counts.set(best, (counts.get(best) ?? 0) + 1);
    total++;
  }
  return [...counts.entries()]
    .map(([name, c]) => ({ name, share: total ? c / total : 0 }))
    .sort((a, b) => b.share - a.share);
}
