// In-memory sliding window rate limiter
// For production with multiple instances, replace with Redis-backed version

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowSeconds * 1000;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt, limit };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, limit };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: limit - entry.count,
    resetAt: entry.resetAt,
    limit,
  };
}
