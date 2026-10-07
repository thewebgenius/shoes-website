import { cookies } from "next/headers";
import { z } from "zod";
import { checkOrigin, ipHashFrom, jsonError } from "@/server/security/request";
import { LIMITS, rateLimit } from "@/server/security/rate-limit";
import { PHOTO_COOKIE, parsePhotoCookie, purgeExpiredTryOns, startTryOn } from "@/server/services/tryon";
import { handleApiError } from "@/server/http";

const bodySchema = z.object({
  productId: z.string().max(64),
  placement: z.object({ x: z.unknown(), y: z.unknown(), scale: z.unknown() }).partial().optional(),
});

/** Generate a preview for the uploaded photo and one shoe. Only called on an explicit click. */
export async function POST(req: Request) {
  try {
    if (!checkOrigin(req, { requireOrigin: true })) return jsonError(403, "Forbidden");
    const ipHash = ipHashFrom(req.headers);
    const limit = await rateLimit(`tryon:${ipHash}`, LIMITS.tryon);
    if (!limit.ok) return jsonError(429, "You've made several try-on requests. Please try again a little later.", { retryAfter: limit.retryAfterSeconds });
    void purgeExpiredTryOns().catch(() => undefined);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, "Choose a shoe from the catalogue.");
    const c = parsePhotoCookie((await cookies()).get(PHOTO_COOKIE)?.value);
    if (!c) return jsonError(410, "Please upload your photo first.");

    const result = await startTryOn({ photoId: c.id, token: c.token, productId: parsed.data.productId, ipHash, placement: parsed.data.placement });
    if (!result.ok) return jsonError(result.status, result.error, result.notConfigured ? { notConfigured: true } : undefined);
    return Response.json(
      { ok: true, sessionId: result.sessionId, status: result.status, reused: result.reused, statusUrl: `/api/try-on/${result.sessionId}/status`, resultUrl: `/api/try-on/${result.sessionId}` },
      { status: 202, headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
