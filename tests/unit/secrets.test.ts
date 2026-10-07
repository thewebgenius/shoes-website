/**
 * Keys must never reach the browser or git.
 *  - .env / .env.local are git-ignored; .env.example holds placeholders only.
 *  - No client component imports server code (where the keys are read).
 *  - After `npm run build`, the browser bundle contains no key names or key values.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const KEY_VARS = ["IMAGE_ENHANCEMENT_API_KEY", "METADATA_API_KEY", "VIRTUAL_TRYON_API_KEY", "TRYON_API_KEY", "THREE_D_API_KEY", "EMBEDDING_API_KEY", "APP_SECRET", "DATABASE_URL"];

function walk(dir: string, out: string[] = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("secrets", () => {
  it("git ignores .env and .env.local", () => {
    for (const f of [".env", ".env.local", ".env.production.local"]) {
      expect(execFileSync("git", ["check-ignore", f], { cwd: root }).toString().trim()).toBe(f);
    }
    expect(() => execFileSync("git", ["check-ignore", ".env.example"], { cwd: root })).toThrow();
  });

  it(".env.example contains no real-looking keys", () => {
    const text = fs.readFileSync(path.join(root, ".env.example"), "utf8");
    for (const line of text.split("\n").filter((l) => /_API_KEY=/.test(l))) expect(line.split("=")[1].trim()).toBe("");
    expect(text).not.toMatch(/sk-ant-|sandbox_[A-Za-z0-9]{8,}|fa-[A-Za-z0-9]{16,}/);
  });

  it("client components never import server modules", () => {
    const files = walk(path.join(root, "src")).filter((f) => /\.tsx?$/.test(f));
    const offenders = files.filter((f) => {
      const src = fs.readFileSync(f, "utf8");
      return /^["']use client["']/.test(src.trimStart()) && /from ["'](@\/server|\.\.?\/.*server\/)/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it.skipIf(!fs.existsSync(path.join(root, ".next/static")))("the browser bundle contains no key names or values", () => {
    const values = KEY_VARS.map((k) => process.env[k]).filter((v): v is string => !!v && v.length >= 8);
    const local = path.join(root, ".env.local");
    if (fs.existsSync(local)) {
      for (const line of fs.readFileSync(local, "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
        if (m && KEY_VARS.includes(m[1]) && m[2].trim().length >= 8) values.push(m[2].trim());
      }
    }
    for (const f of walk(path.join(root, ".next/static"))) {
      const text = fs.readFileSync(f, "utf8");
      for (const name of KEY_VARS.filter((k) => k.endsWith("_KEY"))) expect(text.includes(name), `${name} in ${f}`).toBe(false);
      for (const v of values) expect(text.includes(v), `a secret value in ${path.relative(root, f)}`).toBe(false);
    }
  });
});
