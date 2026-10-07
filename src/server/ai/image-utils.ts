import sharp from "sharp";

/**
 * Image preparation shared by the real providers: everything sent to a vendor
 * is re-encoded (no EXIF/GPS), oriented, and scaled down to what the vendor
 * actually needs, which keeps uploads fast and cheap.
 */

/** JPEG for photos; longest edge capped at `maxEdge`. */
export async function compressForUpload(input: Buffer, maxEdge: number, quality = 90): Promise<Buffer> {
  return sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

/** Same as compressForUpload but keeps transparency (PNG), for cutouts. */
export async function compressPng(input: Buffer, maxEdge: number): Promise<Buffer> {
  return sharp(input).resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
}

/** Crops transparent margins away. Returns the input unchanged if it has no transparent border. */
export async function trimTransparent(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return png;
  return sharp(png).extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }).png().toBuffer();
}

/** Share of fully or partly opaque pixels, and whether the image has any transparency at all. */
export async function alphaCoverage(png: Buffer): Promise<{ opaqueShare: number; hasTransparency: boolean }> {
  const { data, info } = await sharp(png).ensureAlpha().resize(256, 256, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  let opaque = 0;
  let transparent = 0;
  const n = info.width * info.height;
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3];
    if (a > 8) opaque++;
    if (a < 250) transparent++;
  }
  return { opaqueShare: opaque / n, hasTransparency: transparent > 0 };
}

export const toDataUri = (buf: Buffer, mime: string) => `data:${mime};base64,${buf.toString("base64")}`;
