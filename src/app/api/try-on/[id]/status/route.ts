import { cookies } from "next/headers";
import { jsonError } from "@/server/security/request";
import { PHOTO_COOKIE, getTryOnStatus } from "@/server/services/tryon";
import { handleApiError } from "@/server/http";

/** Polled by the Try-On Lab while a preview is generated. */
export async function GET(_req: Request, ctx: RouteContext<"/api/try-on/[id]/status">) {
  try {
    const { id } = await ctx.params;
    const status = await getTryOnStatus(id, (await cookies()).get(PHOTO_COOKIE)?.value);
    if (!status) return jsonError(404, "Not found");
    return Response.json(status, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return handleApiError(e);
  }
}
