import { cookies } from "next/headers";
import { connection } from "next/server";
import { env } from "@/server/env";
import { checkOrigin, ipHashFrom, jsonError } from "@/server/security/request";
import { LIMITS, rateLimit } from "@/server/security/rate-limit";
import { UploadError, validateImageUpload } from "@/server/security/upload";
import { PHOTO_COOKIE, deletePhoto, parsePhotoCookie, photoInfo, purgeExpiredTryOns, savePhoto } from "@/server/services/tryon";
import { handleApiError, readFormFile } from "@/server/http";

const NO_STORE = { "cache-control": "no-store" };

/** Upload the customer's photo once; it is reused for every shoe they try during the visit. */
export async function POST(req: Request) {
  try {
    if (!checkOrigin(req, { requireOrigin: true })) return jsonError(403, "Forbidden");
    const ipHash = ipHashFrom(req.headers);
    const limit = await rateLimit(`tryon-photo:${ipHash}`, LIMITS.tryonPhoto);
    if (!limit.ok) return jsonError(429, "You've uploaded several photos. Please try again a little later.", { retryAfter: limit.retryAfterSeconds });
    void purgeExpiredTryOns().catch(() => undefined);

    const { file, form } = await readFormFile(req, "photo", env().MAX_IMAGE_UPLOAD_MB * 1024 * 1024);
    if (form.get("consent") !== "yes") throw new UploadError("Please confirm you agree to temporary processing of your photo.");
    const photo = await validateImageUpload(file);

    const jar = await cookies();
    const previous = parsePhotoCookie(jar.get(PHOTO_COOKIE)?.value);
    if (previous) await deletePhoto(previous.id, previous.token).catch(() => undefined);

    const saved = await savePhoto(photo, ipHash);
    jar.set(PHOTO_COOKIE, `${saved.photoId}.${saved.token}`, {
      httpOnly: true,
      secure: env().HTTPS,
      sameSite: "strict",
      path: "/api/try-on",
      expires: saved.expiresAt,
    });
    return Response.json({ ok: true, photoId: saved.photoId, expiresAt: saved.expiresAt.toISOString(), width: saved.width, height: saved.height }, { headers: NO_STORE });
  } catch (e) {
    return handleApiError(e);
  }
}

/** Is there a photo for this browser? Lets the page restore after a reload. */
export async function GET() {
  await connection(); // per-request: never prerendered (must stay outside try/catch)
  try {
    const c = parsePhotoCookie((await cookies()).get(PHOTO_COOKIE)?.value);
    const info = c ? await photoInfo(c.id, c.token) : null;
    if (!info) return jsonError(404, "No photo");
    return Response.json({ ok: true, ...info, expiresAt: info.expiresAt.toISOString() }, { headers: NO_STORE });
  } catch (e) {
    return handleApiError(e);
  }
}

/** Delete the photo and every preview made from it, right now. */
export async function DELETE(req: Request) {
  try {
    if (!checkOrigin(req, { requireOrigin: true })) return jsonError(403, "Forbidden");
    const jar = await cookies();
    const c = parsePhotoCookie(jar.get(PHOTO_COOKIE)?.value);
    if (c) await deletePhoto(c.id, c.token);
    jar.delete({ name: PHOTO_COOKIE, path: "/api/try-on" });
    return new Response(null, { status: 204 });
  } catch (e) {
    return handleApiError(e);
  }
}
