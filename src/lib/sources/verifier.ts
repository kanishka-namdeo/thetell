export interface VerificationResult {
  url: string;
  reachable: boolean;
  statusCode?: number;
  contentType?: string;
  responseTimeMs: number;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_USER_AGENT =
  "TheTell-Bot/1.0 (contact@thetell.com)";

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function verifySourceUrl(
  url: string,
  options?: {
    timeoutMs?: number;
    method?: "HEAD" | "GET";
    headers?: Record<string, string>;
  },
): Promise<VerificationResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const primaryMethod = options?.method ?? "HEAD";
  const headers = {
    "User-Agent": DEFAULT_USER_AGENT,
    ...options?.headers,
  };

  const attempt = async (
    method: "HEAD" | "GET",
  ): Promise<VerificationResult> => {
    const start = performance.now();
    try {
      const res = await fetchWithTimeout(
        url,
        { method, headers, redirect: "follow" },
        timeoutMs,
      );
      const responseTimeMs = Math.round(performance.now() - start);
      const contentType =
        res.headers.get("content-type") ?? undefined;
      return {
        url,
        reachable: res.ok,
        statusCode: res.status,
        contentType,
        responseTimeMs,
      };
    } catch (err) {
      const responseTimeMs = Math.round(performance.now() - start);
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? `Timeout after ${timeoutMs}ms`
          : err instanceof Error
            ? err.message
            : String(err);
      return {
        url,
        reachable: false,
        responseTimeMs,
        error: message,
      };
    }
  };

  const result = await attempt(primaryMethod);

  // HEAD may be rejected with 405/501 — retry with GET
  if (
    !result.reachable &&
    primaryMethod === "HEAD" &&
    (result.statusCode === 405 || result.statusCode === 501)
  ) {
    return attempt("GET");
  }

  return result;
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    async () => {
      while (true) {
        const idx = next++;
        if (idx >= tasks.length) return;
        results[idx] = await tasks[idx]();
      }
    },
  );

  await Promise.all(workers);
  return results;
}

export async function verifySourceUrls(
  urls: string[],
  concurrency: number = 5,
): Promise<VerificationResult[]> {
  const tasks = urls.map((url) => () => verifySourceUrl(url));
  return runWithConcurrency(tasks, Math.max(1, concurrency));
}
