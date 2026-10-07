import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { UploadError, inspectGlb, validateImageUpload } from "@/server/security/upload";

const sample = (id: string) => fs.readFileSync(path.resolve(__dirname, "../../seed-assets/models", `${id}.glb`));

describe("image upload validation", () => {
  it("accepts a real JPEG, re-encodes it and strips metadata", async () => {
    const jpeg = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#c33" } })
      .withMetadata({ exif: { IFD0: { Copyright: "secret-gps" } } })
      .jpeg()
      .toBuffer();
    const out = await validateImageUpload(new File([new Uint8Array(jpeg)], "shoe.jpg", { type: "image/jpeg" }), { maxMb: 5 });
    expect(out.width).toBe(300);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe("png");
    expect(meta.exif).toBeUndefined();
  });

  it("rejects a non-image renamed to .jpg", async () => {
    const fake = new File([new TextEncoder().encode("<?php echo 1; ?>")], "shoe.jpg", { type: "image/jpeg" });
    await expect(validateImageUpload(fake, { maxMb: 5 })).rejects.toBeInstanceOf(UploadError);
  });

  it("rejects files over the size limit", async () => {
    const big = new File([new Uint8Array(2 * 1024 * 1024)], "big.png", { type: "image/png" });
    await expect(validateImageUpload(big, { maxMb: 1 })).rejects.toMatchObject({ status: 413 });
  });
});

describe("GLB validation", () => {
  it("accepts a bundled sample model and counts its triangles", async () => {
    const r = await inspectGlb(sample("kids-high-lime"));
    expect(r.meshCount).toBeGreaterThan(0);
    expect(r.triangleCount).toBeGreaterThan(100);
  });

  it("rejects a file with a glTF header but no content", async () => {
    await expect(inspectGlb(Buffer.concat([Buffer.from("glTF"), Buffer.alloc(40)]))).rejects.toBeInstanceOf(UploadError);
  });

  it("rejects random bytes", async () => {
    await expect(inspectGlb(Buffer.from("not a model at all"))).rejects.toBeInstanceOf(UploadError);
  });
});
