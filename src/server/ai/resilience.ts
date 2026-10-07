import { ProviderError, codeForStatus, logProviderError, toProviderError } from "./errors";

export type RetryPolicy = { retries: number; baseDelayMs: number; maxDelayMs: number };

export const DEFAULT_RETRY: RetryPolicy = { retries: 2, baseDelayMs: 1500, maxDelayMs: 15_000 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs a provider call with retries for transient failures only (rate limits,
 * timeouts, network and 5xx errors). Bad keys, empty credit balances and
 * rejected photos fail at once, because retrying them only costs money.
 */
export async function withRetry<T>(
  context: string,
  provider: string,
  fn: (attempt: number) => Promise<T>,
  opts: { policy?: RetryPolicy; onRetry?: (attempt: number, e: ProviderError) => Promise<void> | void } = {},
): Promise<T> {
  const policy = opts.policy ?? DEFAULT_RETRY;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (raw) {
      const e = toProviderError(provider, raw);
      logProviderError(context, e, attempt);
      if (!e.retryable || attempt > policy.retries) throw e;
      await opts.onRetry?.(attempt, e);
      const backoff = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
      const wait = e.retryAfter ? Math.min(policy.maxDelayMs, e.retryAfter * 1000) : backoff;
      await sleep(wait + Math.floor(Math.random() * 250));
    }
  }
}

/** fetch with a hard timeout and no redirects; turns non-2xx into ProviderError. */
export async function providerFetch(
  provider: string,
  url: string,
  init: RequestInit & { timeoutMs: number; errorDetail?: (status: number, body: string) => { code?: ProviderError["code"]; detail?: string } },
): Promise<Response> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new ProviderError(provider, "not_configured", "provider URL must use HTTPS");
  const { timeoutMs, errorDetail, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(u, { ...rest, signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
  } catch (e) {
    throw toProviderError(provider, e);
  }
  if (res.ok) return res;
  const text = (await res.text().catch(() => "")).slice(0, 2000);
  const mapped = errorDetail?.(res.status, text) ?? {};
  const retryAfter = Number(res.headers.get("retry-after")) || undefined;
  throw new ProviderError(provider, mapped.code ?? codeForStatus(res.status), mapped.detail ?? `HTTP ${res.status}`, { httpStatus: res.status, retryAfter });
}

/** Reads a response body with a size cap so a misbehaving provider can't exhaust memory. */
export async function readCapped(provider: string, res: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new ProviderError(provider, "bad_response", "response too large");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new ProviderError(provider, "bad_response", "response too large");
  return buf;
}
