/**
 * Writes background-removal cutouts onto mid-grey, so white soles that the
 * segmentation wrongly erases are visible instead of blending into the page.
 * Usage: npx tsx scripts/dev/seg-check.ts <out-dir> <image...>
 */
import sharp from "sharp";
import { cutoutFromSegmentation, segment } from "../../src/server/ai/local/image-ops";

async function main() {
  const [out, ...files] = process.argv.slice(2);
  const tiles: Buffer[] = [];
  for (const f of files) {
    const buf = await sharp(f).toBuffer();
    const seg = await segment(buf);
    const cut = await cutoutFromSegmentation(buf, seg);
    const tile = await sharp(cut).resize(400, 400, { fit: "contain", background: "#7f8c99" }).flatten({ background: "#7f8c99" }).png().toBuffer();
    tiles.push(tile);
    const name = f.split("/").pop()!.replace(/\.\w+$/, "");
    await sharp(tile).toFile(`${out}/${name}.png`);
    console.log(name, "foreground", seg.foregroundShare.toFixed(3));
  }
  if (tiles.length > 1) {
    await sharp({ create: { width: 400 * tiles.length, height: 400, channels: 3, background: "#000" } })
      .composite(tiles.map((input, i) => ({ input, left: i * 400, top: 0 })))
      .png()
      .toFile(`${out}/grid.png`);
  }
}

void main();
