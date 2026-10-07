import "server-only";
import { AuthError } from "./auth/dal";
import { UploadError } from "./security/upload";
import { WorkflowError } from "./services/product-admin";
import { jsonError } from "./security/request";

/** Maps known errors to safe JSON responses; never leaks stack traces or internals. */
export function handleApiError(e: unknown) {
  if (e instanceof AuthError) return jsonError(e.status, e.status === 401 ? "Please sign in." : "You don't have permission to do that.");
  if (e instanceof UploadError) return jsonError(e.status, e.message);
  if (e instanceof WorkflowError) return jsonError(e.status, e.message);
  console.error("[api]", e);
  return jsonError(500, "Something went wrong. Please try again.");
}

export async function readFormFile(req: Request, field: string, maxBytes: number): Promise<{ file: File | null; form: FormData }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  // Allow multipart overhead; the file itself is re-checked after parsing.
  if (len > maxBytes + 256 * 1024) throw new UploadError(`File is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).`, 413);
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.startsWith("multipart/form-data")) throw new UploadError("Expected a file upload.", 415);
  const form = await req.formData();
  const file = form.get(field);
  return { file: file instanceof File ? file : null, form };
}
