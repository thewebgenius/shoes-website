import { cookies } from "next/headers";
import { checkOrigin, jsonError } from "@/server/security/request";
import { deleteTryOnResult, readTryOnResult } from "@/server/services/tryon";
import { handleApiError } from "@/server/http";

/** Returns the private try-on preview. Only the browser holding the session's HttpOnly cookie can read it. */
export async function GET(_req: Request, ctx: RouteContext<"/api/try-on/[id]">) {
  try {
    const { id } = await ctx.params;
    const token = (await cookies()).get(`tryon_${id}`)?.value;
    const image = await readTryOnResult(id, token);
    if (!image) return new Response("Not found or expired", { status: 404, headers: { "cache-control": "no-store" } });
    return new Response(new Uint8Array(image), {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex",
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/try-on/[id]">) {
  try {
    if (!checkOrigin(req, { requireOrigin: true })) return jsonError(403, "Forbidden");
    const { id } = await ctx.params;
    const jar = await cookies();
    const token = jar.get(`tryon_${id}`)?.value;
    const ok = await deleteTryOnResult(id, token);
    jar.delete({ name: `tryon_${id}`, path: `/api/try-on/${id}` });
    return ok ? new Response(null, { status: 204 }) : jsonError(404, "Not found");
  } catch (e) {
    return handleApiError(e);
  }
}
