/**
 * Base scraper with rate limiting, retry, and polite scraping patterns.
 */

import robotsParser from "robots-parser";
import { logger } from "@/lib/logger";
import { TTLCache } from "./cache";

const DEFAULT_RATE_LIMIT = 1.0; // requests per second
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_CACHE_TTL = 86400; // 24 hours

export class RateLimiter {
  private minInterval: number; // milliseconds
  private lastRequest: number = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(requestsPerSecond: number = DEFAULT_RATE_LIMIT) {
    this.minInterval = 1000 / requestsPerSecond;
  }

  /**
   * Wait until the rate limit allows the next request.
   */
  async wait(): Promise<void> {
    const previous = this.queue;
    let resolve: () => void;
    this.queue = new Promise<void>((r) => {
      resolve = r;
    });

    await previous;

    const now = Date.now();
    const elapsed = now - this.lastRequest;

    if (elapsed < this.minInterval) {
      const waitTime = this.minInterval - elapsed;
      logger.debug("Rate limiter waiting", { waitSeconds: (waitTime / 1000).toFixed(2) });
      await new Promise((r) => setTimeout(r, waitTime));
    }

    this.lastRequest = Date.now();
    resolve!();
  }
}

export class BaseScraper {
  static readonly USER_AGENT =
    "TheTell-Bot/1.0 (+https://thetell.example.com/bot; contact@example.com)";

  protected rateLimiter: RateLimiter;
  protected timeout: number;
  protected maxRetries: number;
  protected cache: TTLCache<string>;
  private robotsCache = new Map<string, ReturnType<typeof robotsParser>>();

  constructor(
    rateLimit?: number,
    timeout?: number,
    maxRetries: number = DEFAULT_MAX_RETRIES,
    cacheTtl: number = DEFAULT_CACHE_TTL,
  ) {
    this.rateLimiter = new RateLimiter(rateLimit ?? DEFAULT_RATE_LIMIT);
    this.timeout = timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = maxRetries;
    this.cache = new TTLCache<string>(cacheTtl);
  }

  /**
   * Check robots.txt to determine if scraping is allowed.
   */
  protected async canScrape(url: string): Promise<boolean> {
    const parsed = new URL(url);
    const baseUrl = `${parsed.protocol}//${parsed.host}`;
    const robotsUrl = `${baseUrl}/robots.txt`;

    if (!this.robotsCache.has(baseUrl)) {
      try {
        const response = await fetch(robotsUrl, {
          headers: { "User-Agent": BaseScraper.USER_AGENT },
          signal: AbortSignal.timeout(this.timeout),
        });

        if (response.ok) {
          const text = await response.text();
          const robots = robotsParser(robotsUrl, text);
          this.robotsCache.set(baseUrl, robots);
        } else {
          // If robots.txt is unavailable, assume allowed
          return true;
        }
      } catch (error) {
        logger.warn("Failed to fetch robots.txt", { url: robotsUrl, error: String(error) });
        return true;
      }
    }

    const robots = this.robotsCache.get(baseUrl)!;
    return robots.isAllowed(url, "*") ?? true;
  }

  /**
   * Fetch a URL with rate limiting, caching, retry, and robots.txt compliance.
   * Returns the response text, or null if the request failed after retries.
   */
  async fetch(url: string): Promise<string | null> {
    const cached = await this.cache.get(url);
    if (cached !== null) {
      logger.debug("Cache hit", { url });
      return cached;
    }

    if (!(await this.canScrape(url))) {
      logger.info("Blocked by robots.txt", { url });
      return null;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      await this.rateLimiter.wait();

      try {
        const response = await fetch(url, {
          headers: { "User-Agent": BaseScraper.USER_AGENT },
          signal: AbortSignal.timeout(this.timeout),
          redirect: "follow",
        });

        if (response.ok) {
          const text = await response.text();
          await this.cache.set(url, text);
          logger.info("Successfully fetched", { url, attempt });
          return text;
        }

        if (response.status === 429 || response.status === 503) {
          const retryAfter = response.headers.get("Retry-After");
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.min(2 ** attempt * 1000, 60000);

          logger.warn("Rate limited / unavailable", {
            url,
            status: response.status,
            waitTime: waitTime / 1000,
            attempt,
          });

          await new Promise((r) => setTimeout(r, waitTime));
          continue;
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error) {
        lastError = error as Error;
        const waitTime = Math.min(2 ** attempt * 1000, 60000);

        logger.warn("Request error", {
          url,
          error: String(error),
          attempt,
          waitTime: waitTime / 1000,
        });

        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, waitTime));
        }
      }
    }

    logger.error("Failed to fetch after retries", {
      url,
      maxRetries: this.maxRetries,
      error: lastError?.message ?? "Unknown error",
    });

    return null;
  }
}
