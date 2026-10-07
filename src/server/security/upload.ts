import "server-only";
import sharp from "sharp";
import { env } from "../env";

export class UploadError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const IMAGE_SIGNATURES: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
  {
    mime: "image/heic",
    test: (b) => b.subarray(4, 8).toString("ascii") === "ftyp" && /hei[cx]|mif1|msf1/.test(b.subarray(8, 12).toString("ascii")),
  },
];

const MAX_PIXELS = 40_000_000;

export type ValidatedImage = { buffer: Buffer; mime: string; width: number; height: number };

/**
 * Validates an uploaded image by size, magic bytes and a real decode. The
 * returned buffer is re-encoded, which strips EXIF/GPS metadata and any
 * payload smuggled after the image data.
 */
export async function validateImageUpload(file: unknown, opts: { maxMb?: number } = {}): Promise<ValidatedImage> {
  if (!(file instanceof File)) throw new UploadError("Please choose an image file.");
  const maxBytes = (opts.maxMb ?? env().MAX_IMAGE_UPLOAD_MB) * 1024 * 1024;
  if (file.size === 0) throw new UploadError("The file is empty.");
  if (file.size > maxBytes) throw new UploadError(`Image is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).`, 413);
  const raw = Buffer.from(await file.arrayBuffer());
  const sig = IMAGE_SIGNATURES.find((s) => s.test(raw));
  if (!sig) throw new UploadError("Unsupported image type. Use JPEG, PNG, WebP or HEIC.", 415);
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(raw, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new UploadError("The image could not be read. It may be corrupted.", 422);
  }
  if (!meta.width || !meta.height) throw new UploadError("The image has no dimensions.", 422);
  if (meta.width < 64 || meta.height < 64) throw new UploadError("Image is too small (min 64×64 px).", 422);
  try {
    // rotate() applies EXIF orientation; re-encoding drops all metadata.
    const { data, info } = await sharp(raw, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, mime: "image/png", width: info.width, height: info.height };
  } catch {
    throw new UploadError("The image could not be processed.", 422);
  }
}

export type ValidatedModel = { buffer: Buffer; triangleCount: number; meshCount: number };

/**
 * Validates a GLB upload: size, binary glTF header, version 2, declared length,
 * and a full parse with no external resource references.
 */
export async function validateGlbUpload(file: unknown): Promise<ValidatedModel> {
  if (!(file instanceof File)) throw new UploadError("Please choose a .glb file.");
  const maxBytes = env().MAX_MODEL_UPLOAD_MB * 1024 * 1024;
  if (file.size === 0) throw new UploadError("The file is empty.");
  if (file.size > maxBytes) throw new UploadError(`Model is too large (max ${env().MAX_MODEL_UPLOAD_MB} MB).`, 413);
  if (!/\.glb$/i.test(file.name)) throw new UploadError("Only binary glTF (.glb) files are accepted.", 415);
  const buffer = Buffer.from(await file.arrayBuffer());
  return { buffer, ...(await inspectGlb(buffer)) };
}

export async function inspectGlb(buffer: Buffer): Promise<{ triangleCount: number; meshCount: number }> {
  if (buffer.length < 20 || buffer.subarray(0, 4).toString("ascii") !== "glTF") {
    throw new UploadError("This is not a binary glTF (.glb) file.", 415);
  }
  const version = buffer.readUInt32LE(4);
  const declared = buffer.readUInt32LE(8);
  if (version !== 2) throw new UploadError("Only glTF 2.0 models are supported.", 415);
  if (declared !== buffer.length) throw new UploadError("The .glb file is truncated or malformed.", 422);

  const { NodeIO } = await import("@gltf-transform/core");
  const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  // Parse the JSON chunk first to reject external URIs before full read.
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) throw new UploadError("Malformed .glb (missing JSON chunk).", 422);
  let json: { buffers?: Array<{ uri?: string }>; images?: Array<{ uri?: string }>; meshes?: unknown[] };
  try {
    json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
  } catch {
    throw new UploadError("Malformed .glb (invalid JSON chunk).", 422);
  }
  const external = [...(json.buffers ?? []), ...(json.images ?? [])].some((r) => r.uri && !r.uri.startsWith("data:"));
  if (external) throw new UploadError("The model references external files. Export it as a self-contained .glb.", 422);
  if (!json.meshes?.length) throw new UploadError("The model contains no meshes.", 422);

  let doc;
  try {
    doc = await io.readBinary(new Uint8Array(buffer));
  } catch {
    throw new UploadError("The model could not be parsed. Re-export it as glTF 2.0 binary.", 422);
  }
  let triangles = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute("POSITION");
      const count = idx ? idx.getCount() : (pos?.getCount() ?? 0);
      if (prim.getMode() === 4) triangles += Math.floor(count / 3);
    }
  }
  if (triangles === 0) throw new UploadError("The model has no triangles to display.", 422);
  if (triangles > 2_000_000) throw new UploadError("The model is too detailed for web display (over 2M triangles).", 422);
  return { triangleCount: triangles, meshCount: doc.getRoot().listMeshes().length };
}
