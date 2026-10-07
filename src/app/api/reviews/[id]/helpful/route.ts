import { checkOrigin, ipHashFrom, jsonError } from "@/server/security/request";
import { voteHelpful } from "@/server/services/reviews";
import { handleApiError } from "@/server/http";

export async function POST(req: Request, ctx: RouteContext<"/api/reviews/[id]/helpful">) {
  try {
    if (!checkOrigin(req, { requireOrigin: true })) return jsonError(403, "Forbidden");
    const { id } = await ctx.params;
    const result = await voteHelpful(id, ipHashFrom(req.headers));
    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    return handleApiError(e);
  }
}
