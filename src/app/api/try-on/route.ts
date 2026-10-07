import { cookies } from "next/headers";
import { env } from "@/server/env";
import { checkOrigin, ipHashFrom, jsonError } from "@/server/security/request";
import { LIMITS, rateLimit } from "@/server/security/rate-limit";
import { UploadError, validateImageUpload } from "@/server/security/upload";
import { purgeExpiredTryOns, runTryOn } from "@/server/services/tryon";
import { handleApiError, readFormFile } from "@/server/http";

export async function POST(req: Request) {
  try {
    if (!checkOrigin(req, { requireOrigin: true })) return jsonError(403, "Forbidden");
    const ipHash = ipHashFrom(req.headers);
    const limit = await rateLimit(`tryon:${ipHash}`, LIMITS.tryon);
    if (!limit.ok) return jsonError(429, "You've made several try-on requests. Please try again a little later.", { retryAfter: limit.retryAfterSeconds });

    void purgeExpiredTryOns().catch(() => undefined);

    const { file, form } = await readFormFile(req, "photo", env().MAX_IMAGE_UPLOAD_MB * 1024 * 1024);
    if (form.get("consent") !== "yes") throw new UploadError("Please confirm you agree to temporary processing of your photo.");
    const photo = await validateImageUpload(file);
    const result = await runTryOn({ productId: String(form.get("productId") ?? ""), photo, ipHash });
    if (!result.ok) return jsonError(result.status, result.error);

    const jar = await cookies();
    jar.set(`tryon_${result.sessionId}`, result.token, {
      httpOnly: true,
      secure: env().HTTPS,
      sameSite: "strict",
      path: `/api/try-on/${result.sessionId}`,
      expires: result.expiresAt,
    });
    return Response.json(
      {
        ok: true,
        sessionId: result.sessionId,
        resultUrl: `/api/try-on/${result.sessionId}`,
        expiresAt: result.expiresAt.toISOString(),
        isMock: result.isMock,
        provider: result.providerLabel,
        label: "AI-generated visual preview",
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
