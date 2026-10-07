import { z } from "zod";
import { authorizeApi } from "@/server/auth/dal";
import { env } from "@/server/env";
import { checkOrigin, jsonError } from "@/server/security/request";
import { LIMITS, rateLimit } from "@/server/security/rate-limit";
import { validateGlbUpload } from "@/server/security/upload";
import { uploadModel } from "@/server/services/product-admin";
import { handleApiError, readFormFile } from "@/server/http";

/** Upload an existing GLB model for a product (source: admin_upload). */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/products/[id]/models">) {
  try {
    if (!checkOrigin(req, { requireOrigin: true })) return jsonError(403, "Forbidden");
    const user = await authorizeApi("products:write");
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) return jsonError(404, "Product not found.");
    const limit = await rateLimit(`admin-upload:${user.id}`, LIMITS.adminUpload);
    if (!limit.ok) return jsonError(429, "Upload limit reached. Try again later.");
    const { file } = await readFormFile(req, "model", env().MAX_MODEL_UPLOAD_MB * 1024 * 1024);
    const model = await validateGlbUpload(file);
    const asset = await uploadModel(id, model, (file as File).name, user);
    return Response.json({ ok: true, assetId: asset.id, triangles: model.triangleCount }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
