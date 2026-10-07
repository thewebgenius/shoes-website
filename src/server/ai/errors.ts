/**
 * Structured provider errors. Every adapter converts whatever the vendor
 * returned into one of these codes, so the rest of the app can decide whether
 * to retry and what to tell people without ever showing raw vendor responses,
 * keys or stack traces.
 */

export type ProviderErrorCode =
  | "not_configured"
  | "auth"
  | "quota"
  | "rate_limited"
  | "invalid_input"
  | "content_rejected"
  | "timeout"
  | "network"
  | "upstream"
  | "bad_response";

const RETRYABLE: ReadonlySet<ProviderErrorCode> = new Set(["rate_limited", "timeout", "network", "upstream"]);

/** Messages safe to show to shopkeepers and customers. */
const USER_MESSAGES: Record<ProviderErrorCode, string> = {
  not_configured: "AI provider not configured.",
  auth: "The AI provider rejected the API key. Check the key in the server environment.",
  quota: "The AI provider account has run out of credits.",
  rate_limited: "The AI provider is busy. Please try again in a minute.",
  invalid_input: "The AI provider could not use this photo. Try a clearer, well-lit photo.",
  content_rejected: "The AI provider declined this photo.",
  timeout: "The AI provider took too long to respond.",
  network: "Could not reach the AI provider.",
  upstream: "The AI provider had a temporary error.",
  bad_response: "The AI provider returned an unexpected response.",
};

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly provider: string;
  readonly httpStatus?: number;
  /** Seconds the provider asked us to wait, when it said. */
  readonly retryAfter?: number;

  constructor(provider: string, code: ProviderErrorCode, detail?: string, opts: { httpStatus?: number; retryAfter?: number } = {}) {
    // `detail` is for server logs and the admin job history. It must never contain keys or image data.
    super(detail ? `${USER_MESSAGES[code]} (${detail})` : USER_MESSAGES[code]);
    this.name = "ProviderError";
    this.code = code;
    this.provider = provider;
    this.httpStatus = opts.httpStatus;
    this.retryAfter = opts.retryAfter;
  }

  get retryable() {
    return RETRYABLE.has(this.code);
  }

  get userMessage() {
    return USER_MESSAGES[this.code];
  }
}

export function userMessageFor(code: ProviderErrorCode) {
  return USER_MESSAGES[code];
}

/** Maps an HTTP status from any vendor to a code. Vendors refine this where their docs say more. */
export function codeForStatus(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "quota";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 413 || status === 415 || status === 422) return "invalid_input";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "upstream";
  return "bad_response";
}

/** Normalises anything thrown during a provider call. */
export function toProviderError(provider: string, e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  const err = e as { name?: string; code?: string; cause?: { code?: string } };
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return new ProviderError(provider, "timeout");
  if (err?.name === "TypeError" || err?.cause?.code || err?.code) return new ProviderError(provider, "network", err?.cause?.code ?? err?.code);
  return new ProviderError(provider, "bad_response", (e as Error)?.message?.slice(0, 200));
}

/**
 * One log line per provider failure: provider, code, status and attempt.
 * Never the request body, the image, the key or a stack trace.
 */
export function logProviderError(context: string, e: ProviderError, attempt?: number) {
  console.error(
    `[ai:${context}]`,
    JSON.stringify({ provider: e.provider, code: e.code, status: e.httpStatus, attempt, detail: e.message.slice(0, 300) }),
  );
}
