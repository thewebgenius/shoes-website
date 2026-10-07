import "server-only";
import { headers } from "next/headers";
import { allowedOrigins, env } from "../env";
import { hmac } from "./crypto";

/** Best-effort client IP. X-Forwarded-For is only trusted when TRUST_PROXY=true. */
export function clientIpFrom(h: Headers): string {
  if (env().TRUST_PROXY) {
    const fwd = h.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    const real = h.get("x-real-ip");
    if (real) return real.trim();
  }
  return h.get("x-forwarded-for")?.split(",").pop()?.trim() || "local";
}

export function ipHashFrom(h: Headers) {
  return hmac(clientIpFrom(h), "ip");
}

export async function currentIpHash() {
  return ipHashFrom(await headers());
}

/**
 * CSRF / CORS guard for state-changing API requests. Browsers always send Origin
 * on cross-site POSTs, so requiring it to match an allowed origin blocks
 * cross-site form posts and fetches. Requests with no Origin (curl, server to
 * server) are refused for cookie-authenticated admin routes.
 */
export function checkOrigin(req: Request, { requireOrigin }: { requireOrigin: boolean }): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    if (requireOrigin) return false;
    const fetchSite = req.headers.get("sec-fetch-site");
    return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
  }
  if (allowedOrigins().includes(origin)) return true;
  // Same host as the request (covers alternative hostnames for the same deployment).
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return Response.json({ error: message, ...extra }, { status, headers: { "cache-control": "no-store" } });
}
