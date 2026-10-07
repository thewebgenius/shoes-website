import { z } from "zod";
import { checkOrigin, ipHashFrom, jsonError } from "@/server/security/request";
import { LIMITS, rateLimit } from "@/server/security/rate-limit";
import { track } from "@/server/services/analytics";
import { db } from "@/server/db/client";
import { products } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";

const body = z.object({ type: z.enum(["product_view", "model_interaction"]), productId: z.string().uuid() });

/** Client-side events only (views and 3D interactions). Server-side events are recorded where they happen. */
export async function POST(req: Request) {
  if (!checkOrigin(req, { requireOrigin: false })) return jsonError(403, "Forbidden");
  const ipHash = ipHashFrom(req.headers);
  const limit = await rateLimit(`analytics:${ipHash}`, LIMITS.analytics);
  if (!limit.ok) return new Response(null, { status: 204 });
  const raw = await req.text();
  if (raw.length > 1000) return jsonError(413, "Too large");
  let parsed;
  try {
    parsed = body.safeParse(JSON.parse(raw));
  } catch {
    return jsonError(400, "Invalid body");
  }
  if (!parsed.success) return jsonError(400, "Invalid event");
  const [p] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, parsed.data.productId), eq(products.status, "published"))).limit(1);
  if (p) await track(parsed.data.type, { productId: p.id, visitorHash: ipHash });
  return new Response(null, { status: 204 });
}
