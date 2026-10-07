"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/dal";
import { dummyVerify, verifyPassword } from "@/server/auth/password";
import { createSession, destroyAllSessionsFor, destroySession, getSessionUser } from "@/server/auth/session";
import { audit } from "@/server/security/audit";
import { LIMITS, rateLimit, resetRateLimit } from "@/server/security/rate-limit";
import { ipHashFrom } from "@/server/security/request";
import { hmac } from "@/server/security/crypto";
import {
  WorkflowError,
  assignSampleModel,
  createProduct,
  processRawImage,
  productInputSchema,
  requestGeneratedModel,
  setPrimaryImage,
  transition,
  updateProduct,
} from "@/server/services/product-admin";
import { moderateReview } from "@/server/services/reviews";

export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> } | null;

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(256),
});

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const h = await headers();
  const ipHash = ipHashFrom(h);
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  const generic = "Incorrect email or password.";
  if (!parsed.success) return { error: generic };
  const { email, password } = parsed.data;

  const ipLimit = await rateLimit(`login-ip:${ipHash}`, LIMITS.loginIp);
  const acctLimit = await rateLimit(`login:${hmac(email, "login")}`, LIMITS.login);
  if (!ipLimit.ok || !acctLimit.ok) {
    await audit(null, "auth.login_rate_limited", { type: "user", id: email }, undefined, ipHash);
    return { error: `Too many sign-in attempts. Try again in ${Math.ceil(Math.max(ipLimit.retryAfterSeconds, acctLimit.retryAfterSeconds) / 60)} minutes.` };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    await dummyVerify(password); // equalise timing so emails can't be enumerated
    await audit(null, "auth.login_failed", { type: "user", id: email }, { reason: "unknown_email" }, ipHash);
    return { error: generic };
  }
  if (!user.isActive) {
    await dummyVerify(password);
    return { error: generic };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await dummyVerify(password);
    await audit(null, "auth.login_locked", { type: "user", id: user.id }, undefined, ipHash);
    return { error: "This account is temporarily locked after several failed attempts. Try again later." };
  }
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const failures = user.failedLoginCount + 1;
    await db
      .update(users)
      .set({ failedLoginCount: failures, lockedUntil: failures >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
      .where(eq(users.id, user.id));
    await audit(null, "auth.login_failed", { type: "user", id: user.id }, { reason: "bad_password", failures }, ipHash);
    return { error: generic };
  }

  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await resetRateLimit(`login:${hmac(email, "login")}`);
  await createSession(user.id, { ipHash, userAgent: h.get("user-agent") });
  await audit({ id: user.id, email: user.email }, "auth.login", { type: "user", id: user.id }, undefined, ipHash);
  redirect("/admin");
}

export async function logoutAction() {
  const user = await getSessionUser();
  await destroySession();
  if (user) await audit(user, "auth.logout", { type: "user", id: user.id });
  redirect("/admin/login");
}

export async function logoutEverywhereAction() {
  const user = await requireUser();
  await destroyAllSessionsFor(user.id);
  await audit(user, "auth.logout_all", { type: "user", id: user.id });
  redirect("/admin/login");
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

function productFromForm(form: FormData) {
  return {
    name: String(form.get("name") ?? ""),
    category: String(form.get("category") ?? ""),
    gender: String(form.get("gender") ?? "unisex"),
    shoeType: String(form.get("shoeType") ?? ""),
    brand: String(form.get("brand") ?? ""),
    color: String(form.get("color") ?? ""),
    secondaryColors: String(form.get("secondaryColors") ?? ""),
    style: String(form.get("style") ?? ""),
    modelName: String(form.get("modelName") ?? ""),
    description: String(form.get("description") ?? ""),
    metadataVerified: form.get("metadataVerified") === "on",
  };
}

function fieldErrors(e: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

function toState(e: unknown): ActionState {
  if (e instanceof WorkflowError) return { error: e.message };
  if (e instanceof z.ZodError) return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(e) };
  console.error("[admin action]", e);
  return { error: "Something went wrong. Please try again." };
}

const uuid = z.string().uuid();

export async function createProductAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("products:write");
  const parsed = productInputSchema.safeParse(productFromForm(form));
  if (!parsed.success) return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  let id: string;
  try {
    id = (await createProduct(parsed.data, user)).id;
  } catch (e) {
    return toState(e);
  }
  redirect(`/admin/products/${id}?created=1`);
}

export async function updateProductAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("products:write");
  const id = String(form.get("id") ?? "");
  if (!uuid.safeParse(id).success) return { error: "Invalid product." };
  const parsed = productInputSchema.safeParse(productFromForm(form));
  if (!parsed.success) return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  try {
    await updateProduct(id, parsed.data, user);
  } catch (e) {
    return toState(e);
  }
  refresh();
  return { ok: true, message: parsed.data.metadataVerified ? "Saved. Metadata marked as verified." : "Saved." };
}

const transitionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["submit", "approve", "publish", "reject", "unpublish", "archive", "restore", "edit"]),
  reason: z.string().max(500).optional(),
});

export async function transitionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = transitionSchema.safeParse({ id: form.get("id"), action: form.get("action"), reason: form.get("reason") ?? undefined });
  if (!parsed.success) return { error: "Invalid request." };
  const { id, action, reason } = parsed.data;
  const user = await requireUser(action === "approve" || action === "publish" || action === "unpublish" ? "products:publish" : "products:write");
  try {
    await transition(id, action, user, { reason });
  } catch (e) {
    return toState(e);
  }
  refresh();
  const onPreview = action === "submit" || (form.get("from") === "preview" && action !== "archive");
  redirect(`/admin/products/${id}${onPreview ? "/preview" : ""}?done=${action}`);
}

export async function assignSampleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("products:write");
  const id = String(form.get("id") ?? "");
  const sample = String(form.get("sample") ?? "");
  if (!uuid.safeParse(id).success || !sample) return { error: "Choose a sample model." };
  try {
    await assignSampleModel(id, sample, user);
  } catch (e) {
    return toState(e);
  }
  refresh();
  return { ok: true, message: "Sample model assigned." };
}

export async function generateModelAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("products:write");
  const id = String(form.get("id") ?? "");
  if (!uuid.safeParse(id).success) return { error: "Invalid product." };
  const result = await requestGeneratedModel(id, user);
  refresh();
  return result.ok ? { ok: true, message: "AI-generated model added. Check it carefully before approving." } : { error: result.error };
}

export async function reprocessImageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("products:write");
  const id = String(form.get("id") ?? "");
  const rawId = String(form.get("rawId") ?? "");
  if (!uuid.safeParse(id).success || !uuid.safeParse(rawId).success) return { error: "Invalid request." };
  try {
    const result = await processRawImage(id, rawId, user);
    refresh();
    return result.ok ? { ok: true, message: "Processing started." } : { error: result.error };
  } catch (e) {
    return toState(e);
  }
}

export async function setPrimaryImageAction(form: FormData) {
  const user = await requireUser("products:write");
  const id = String(form.get("id") ?? "");
  const imageId = String(form.get("imageId") ?? "");
  if (!uuid.safeParse(id).success || !uuid.safeParse(imageId).success) return;
  await setPrimaryImage(id, imageId);
  await audit(user, "product.image.set_primary", { type: "product", id }, { imageId });
  refresh();
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export async function moderateReviewAction(form: FormData) {
  const user = await requireUser("reviews:moderate");
  const id = String(form.get("id") ?? "");
  const decision = z.enum(["approved", "rejected", "spam", "delete"]).safeParse(form.get("decision"));
  if (!uuid.safeParse(id).success || !decision.success) return;
  await moderateReview(id, decision.data, user);
  refresh();
}
