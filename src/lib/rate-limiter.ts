// In-memory fixed-window rate limiter
// For production with multiple instances, replace with Redis-backed version

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
const MAX_STORE_SIZE = 10_000;
let lastCleanup = Date.now();

// Lazy cleanup: purge expired entries every ~5 minutes during checkRateLimit calls
function cleanup(now: number) {
  if (now - lastCleanup < 5 * 60 * 1000) return;
  lastCleanup = now;
  for (const key of store.keys()) {
    const entry = store.get(key);
    if (entry && now > entry.resetAt) store.delete(key);
  }
}

// Background cleanup: runs periodically even during idle periods
// This prevents stale entries from persisting indefinitely when API is quiet
// Use a global to prevent multiple intervals on hot reload
if (typeof globalThis.setInterval !== "undefined") {
  const globalKey = "__rateLimiterCleanupInterval";
  if (!(globalKey in globalThis)) {
    const backgroundCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of store.entries()) {
        if (now > entry.resetAt) {
          store.delete(key);
        }
      }
    }, 5 * 60 * 1000); // Run every 5 minutes

    // Prevent timer from keeping Node.js process alive
    if (typeof backgroundCleanupTimer.unref === "function") {
      backgroundCleanupTimer.unref();
    }

    (globalThis as Record<string, unknown>)[globalKey] = backgroundCleanupTimer;
  }
}

// Hard cap: evict oldest expired entries when store exceeds max size
function enforceHardCap(now: number) {
  if (store.size <= MAX_STORE_SIZE) return;
  // First pass: remove all expired entries
  for (const key of store.keys()) {
    const entry = store.get(key);
    if (entry && now > entry.resetAt) store.delete(key);
  }
  // If still over cap, remove oldest entries until under limit
  if (store.size > MAX_STORE_SIZE) {
    const excess = store.size - MAX_STORE_SIZE;
    const keys = store.keys();
    for (let i = 0; i < excess; i++) {
      const result = keys.next();
      if (result.done) break;
      store.delete(result.value);
    }
  }
}

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
  cleanup(now);
  enforceHardCap(now);
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
