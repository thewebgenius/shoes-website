import "server-only";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { env } from "../env";

/**
 * File storage abstraction. The local implementation writes under STORAGE_DIR,
 * which lives outside /public: nothing stored here is reachable by URL except
 * through the authorising media routes. A cloud implementation (S3, R2, GCS)
 * can replace this by implementing the same interface.
 */
export interface StorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  stream(key: string): Promise<{ stream: ReadableStream; size: number } | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const KEY_RE = /^[a-z0-9][a-z0-9/_.-]{0,250}$/i;

class LocalStorage implements StorageProvider {
  private root = path.resolve(env().STORAGE_DIR);

  private resolve(key: string) {
    if (!KEY_RE.test(key) || key.includes("..")) throw new Error(`Invalid storage key: ${key}`);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Storage key escapes root");
    return full;
  }

  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    await fs.writeFile(full, data, { mode: 0o600 });
  }

  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }

  async stream(key: string) {
    const full = this.resolve(key);
    try {
      const st = await fs.stat(full);
      const node = createReadStream(full);
      const stream = new ReadableStream({
        start(controller) {
          node.on("data", (c) => controller.enqueue(new Uint8Array(c as Buffer)));
          node.on("end", () => controller.close());
          node.on("error", (e) => controller.error(e));
        },
        cancel() {
          node.destroy();
        },
      });
      return { stream, size: st.size };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }

  async deletePrefix(prefix: string) {
    await fs.rm(this.resolve(prefix.replace(/\/$/, "")), { recursive: true, force: true });
  }

  async exists(key: string) {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}

let instance: StorageProvider | null = null;
export function storage(): StorageProvider {
  instance ??= new LocalStorage();
  return instance;
}

export const storageKeys = {
  rawImage: (productId: string, imageId: string) => `private/raw/${productId}/${imageId}.png`,
  productImage: (productId: string, imageId: string, variant: number | "full") => `catalog/${productId}/images/${imageId}/${variant}.webp`,
  cutout: (productId: string, imageId: string) => `catalog/${productId}/images/${imageId}/cutout.png`,
  model: (productId: string, assetId: string) => `catalog/${productId}/models/${assetId}.glb`,
  tryonResult: (sessionId: string) => `private/tryon/${sessionId}.jpg`,
};
