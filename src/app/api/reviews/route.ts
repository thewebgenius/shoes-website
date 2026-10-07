import { checkOrigin, ipHashFrom, jsonError } from "@/server/security/request";
import { submitReview } from "@/server/services/reviews";
import { handleApiError } from "@/server/http";

export async function POST(req: Request) {
  try {
    if (!checkOrigin(req, { requireOrigin: true })) return jsonError(403, "Forbidden");
    const raw = await req.text();
    if (raw.length > 8000) return jsonError(413, "Review is too long.");
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw);
    } catch {
      return jsonError(400, "Invalid request.");
    }
    const result = await submitReview(data, ipHashFrom(req.headers));
    if (!result.ok) {
      return Response.json(result, { status: result.retryAfter ? 429 : 400, headers: result.retryAfter ? { "retry-after": String(result.retryAfter) } : {} });
    }
    return Response.json(result, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
