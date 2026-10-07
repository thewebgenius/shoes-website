import { env } from "@/server/env";
import { checkOrigin, ipHashFrom, jsonError } from "@/server/security/request";
import { LIMITS, rateLimit } from "@/server/security/rate-limit";
import { validateImageUpload } from "@/server/security/upload";
import { visualSearch } from "@/server/services/visual-search";
import { handleApiError, readFormFile } from "@/server/http";

export async function POST(req: Request) {
  try {
    if (!checkOrigin(req, { requireOrigin: true })) return jsonError(403, "Forbidden");
    const ipHash = ipHashFrom(req.headers);
    const limit = await rateLimit(`vsearch:${ipHash}`, LIMITS.visualSearch);
    if (!limit.ok) return jsonError(429, "Too many searches. Please wait a little and try again.", { retryAfter: limit.retryAfterSeconds });
    const { file } = await readFormFile(req, "photo", env().MAX_IMAGE_UPLOAD_MB * 1024 * 1024);
    const photo = await validateImageUpload(file);
    const result = await visualSearch(photo, ipHash, 5);
    if (!result.ok) return jsonError(422, result.error);
    return Response.json(
      {
        ok: true,
        noMatch: result.noMatch,
        isMock: result.isMock,
        provider: result.providerLabel,
        matches: result.matches.map((m) => ({
          rank: m.rank,
          similarity: m.similarity,
          id: m.id,
          slug: m.slug,
          name: m.name,
          category: m.category,
          color: m.color,
          shoeType: m.shoeType,
          image: m.image,
          rating: m.rating,
          hasModel: !!m.model,
        })),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
