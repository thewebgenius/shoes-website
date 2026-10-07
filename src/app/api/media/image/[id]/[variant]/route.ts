import { optionalUser } from "@/server/auth/dal";
import { authorizeImage } from "@/server/services/media";
import { storage } from "@/server/storage";

export async function GET(_req: Request, ctx: RouteContext<"/api/media/image/[id]/[variant]">) {
  const { id, variant } = await ctx.params;
  const user = await optionalUser();
  const grant = await authorizeImage(id, variant, user);
  if (!grant) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  const file = await storage().stream(grant.key);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.stream, {
    headers: {
      "content-type": grant.contentType,
      "content-length": String(file.size),
      "cache-control": grant.cache === "public" ? "public, max-age=3600, stale-while-revalidate=86400" : "private, no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
}
