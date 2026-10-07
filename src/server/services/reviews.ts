import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { products, reviews, reviewVotes } from "../db/schema";
import { aiProviders } from "../ai/registry";
import { LIMITS, rateLimit } from "../security/rate-limit";
import { signPayload, verifyPayload } from "../security/crypto";
import { audit } from "../security/audit";
import { track } from "./analytics";
import type { SessionUser } from "../auth/session";

const MIN_FILL_SECONDS = 3;

/** Issued when the review form renders; proves a human-speed round trip. */
export function reviewFormToken(productId: string) {
  return signPayload({ p: productId, t: Date.now() }, 60 * 60 * 6);
}

export const reviewInputSchema = z.object({
  productId: z.string().uuid(),
  rating: z.coerce.number().int().min(1, "Choose a star rating").max(5),
  displayName: z
    .string()
    .trim()
    .min(2, "Please enter a display name")
    .max(40, "Display name is too long")
    .regex(/^[\p{L}\p{M}\p{N} .,'’-]+$/u, "Use letters, numbers and simple punctuation only"),
  body: z.string().trim().min(10, "Please write at least 10 characters").max(2000, "Review is too long (max 2000 characters)"),
  formToken: z.string().max(2048),
  website: z.string().max(200).optional().default(""), // honeypot
});

export type ReviewSubmitResult =
  | { ok: true; status: "pending" }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; retryAfter?: number };

export async function submitReview(raw: Record<string, unknown>, ipHash: string): Promise<ReviewSubmitResult> {
  const parsed = reviewInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const input = parsed.data;

  const limit = await rateLimit(`review:${ipHash}`, LIMITS.review);
  if (!limit.ok) return { ok: false, error: "You have submitted several reviews recently. Please try again later.", retryAfter: limit.retryAfterSeconds };

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, input.productId), eq(products.status, "published")))
    .limit(1);
  if (!product) return { ok: false, error: "This product is not available for reviews." };

  const token = verifyPayload<{ p: string; t: number }>(input.formToken);
  const tooFast = !token || token.p !== input.productId || Date.now() - token.t < MIN_FILL_SECONDS * 1000;
  const honeypot = input.website.trim().length > 0;

  const screen = await aiProviders().moderation.screen({ displayName: input.displayName, body: input.body });
  const flags = [...screen.flags];
  if (tooFast) flags.push(token ? "submitted_too_fast" : "invalid_form_token");
  if (honeypot) flags.push("honeypot");

  // Duplicate text from the same visitor → spam.
  const [dup] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.ipHash, ipHash), eq(reviews.body, input.body)))
    .limit(1);
  if (dup) flags.push("duplicate");

  const isSpam = honeypot || screen.verdict === "spam" || !!dup;
  await db.insert(reviews).values({
    productId: input.productId,
    rating: input.rating,
    displayName: input.displayName,
    body: input.body,
    status: isSpam ? "spam" : "pending",
    moderationFlags: flags,
    ipHash,
  });
  if (!isSpam) await track("review_submit", { productId: input.productId, visitorHash: ipHash, metadata: { rating: input.rating } });
  // Spam gets the same response so bots learn nothing.
  return { ok: true, status: "pending" };
}

export async function voteHelpful(reviewId: string, voterHash: string) {
  if (!z.string().uuid().safeParse(reviewId).success) return { ok: false as const, error: "Invalid review." };
  const limit = await rateLimit(`vote:${voterHash}`, LIMITS.reviewVote);
  if (!limit.ok) return { ok: false as const, error: "Too many votes. Try again later." };
  const [review] = await db.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.id, reviewId), eq(reviews.status, "approved"))).limit(1);
  if (!review) return { ok: false as const, error: "Review not found." };
  const inserted = await db.insert(reviewVotes).values({ reviewId, voterHash }).onConflictDoNothing().returning({ id: reviewVotes.id });
  if (inserted.length) {
    await db
      .update(reviews)
      .set({ helpfulCount: sql`(select count(*)::int from review_votes v where v.review_id = ${reviewId})` })
      .where(eq(reviews.id, reviewId));
  }
  const [r] = await db.select({ helpfulCount: reviews.helpfulCount }).from(reviews).where(eq(reviews.id, reviewId));
  return { ok: true as const, helpfulCount: r.helpfulCount, alreadyVoted: !inserted.length };
}

// --- Admin moderation --------------------------------------------------------

export async function listReviewsForModeration(status: "pending" | "approved" | "rejected" | "spam" = "pending") {
  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      displayName: reviews.displayName,
      body: reviews.body,
      status: reviews.status,
      flags: reviews.moderationFlags,
      createdAt: reviews.createdAt,
      productName: products.name,
      productSlug: products.slug,
    })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(eq(reviews.status, status))
    .orderBy(desc(reviews.createdAt))
    .limit(200);
}

export async function reviewCounts() {
  const rows = await db.select({ status: reviews.status, n: sql<number>`count(*)::int` }).from(reviews).groupBy(reviews.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Partial<Record<string, number>>;
}

export async function moderateReview(reviewId: string, decision: "approved" | "rejected" | "spam" | "delete", actor: SessionUser) {
  if (!z.string().uuid().safeParse(reviewId).success) throw new Error("Invalid review id");
  const [before] = await db.select().from(reviews).where(eq(reviews.id, reviewId)).limit(1);
  if (!before) throw new Error("Review not found");
  if (decision === "delete") {
    await db.delete(reviews).where(eq(reviews.id, reviewId));
  } else {
    await db.update(reviews).set({ status: decision, moderatedBy: actor.id, moderatedAt: new Date() }).where(eq(reviews.id, reviewId));
  }
  await audit(actor, `review.${decision}`, { type: "review", id: reviewId }, { productId: before.productId, from: before.status });
}
