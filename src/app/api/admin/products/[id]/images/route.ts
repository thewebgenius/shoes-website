import { z } from "zod";
import { authorizeApi } from "@/server/auth/dal";
import { env } from "@/server/env";
import { checkOrigin, jsonError } from "@/server/security/request";
import { LIMITS, rateLimit } from "@/server/security/rate-limit";
import { validateImageUpload } from "@/server/security/upload";
import { uploadAndProcessRawImage } from "@/server/services/product-admin";
import { handleApiError, readFormFile } from "@/server/http";

/** Upload a raw shoe photo; runs background removal → enhancement → crop/resize → embedding → metadata suggestion. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/products/[id]/images">) {
  try {
    if (!checkOrigin(req, { requireOrigin: true })) return jsonError(403, "Forbidden");
    const user = await authorizeApi("products:write");
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) return jsonError(404, "Product not found.");
    const limit = await rateLimit(`admin-upload:${user.id}`, LIMITS.adminUpload);
    if (!limit.ok) return jsonError(429, "Upload limit reached. Try again later.");
    const { file } = await readFormFile(req, "image", env().MAX_IMAGE_UPLOAD_MB * 1024 * 1024);
    const image = await validateImageUpload(file);
    const result = await uploadAndProcessRawImage(id, image, user);
    return Response.json(result, { status: result.ok ? 201 : 207 });
  } catch (e) {
    return handleApiError(e);
  }
}
