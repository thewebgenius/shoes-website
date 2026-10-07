import { cookies } from "next/headers";
import { connection } from "next/server";
import { PHOTO_COOKIE, parsePhotoCookie, readPhoto } from "@/server/services/tryon";
import { handleApiError } from "@/server/http";

const PRIVATE = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff", "x-robots-tag": "noindex" };

/** The visitor's own uploaded photo. Only the browser holding the HttpOnly cookie can read it. */
export async function GET() {
  await connection(); // per-request: never prerendered (must stay outside try/catch)
  try {
    const c = parsePhotoCookie((await cookies()).get(PHOTO_COOKIE)?.value);
    const image = c ? await readPhoto(c.id, c.token) : null;
    if (!image) return new Response("Not found or expired", { status: 404, headers: PRIVATE });
    return new Response(new Uint8Array(image), { headers: { ...PRIVATE, "content-type": "image/jpeg" } });
  } catch (e) {
    return handleApiError(e);
  }
}
