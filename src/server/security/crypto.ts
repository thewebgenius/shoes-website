import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env";

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

/** Keyed hash so raw IPs and identifiers are never stored. */
export function hmac(input: string, purpose: string) {
  return createHmac("sha256", env().APP_SECRET).update(`${purpose}:${input}`).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Signs a small payload with an expiry. Used for form timing tokens. */
export function signPayload(payload: Record<string, unknown>, ttlSeconds: number) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 })).toString("base64url");
  return `${body}.${hmac(body, "signed-payload")}`;
}

export function verifyPayload<T extends Record<string, unknown>>(token: string | null | undefined): (T & { exp: number }) | null {
  if (!token || typeof token !== "string" || token.length > 2048) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, hmac(body, "signed-payload"))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}
