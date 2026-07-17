/**
 * Base scraper with rate limiting, retry, and polite scraping patterns.
 */

import { createHash } from "crypto";
import robotsParser from "robots-parser";
import { logger } from "@/lib/logger";
import { TTLCache } from "./cache";

const DEFAULT_RATE_LIMIT = 1.0; // requests per second
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_CACHE_TTL = 86400; // 24 hours
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ROBOTS_CACHE_SIZE = 1000; // Prevent unbounded growth

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
  protected skipRobots: boolean;
  // Static: shared across all scraper instances to avoid 30x duplication
  private static robotsCache = new Map<string, { parser: ReturnType<typeof robotsParser>; expiresAt: number }>();
  private static readonly ROBOTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  // Domain-level circuit breaker: track consecutive failures per domain
  private static domainFailures = new Map<string, { count: number; lastFailure: number }>();
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private static readonly CIRCUIT_BREAKER_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly DOMAIN_FAILURES_MAX_SIZE = 500;
  private static lastCleanupTime = 0;
  private static readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  
  // Robots cache cleanup tracking
  private static lastRobotsCleanupTime = 0;

  // Provenance tracking: updated on each successful fetch()
  protected lastFetchAttempts: number = 0;
  protected lastFetchHash: string | null = null;

  constructor(
    rateLimit?: number,
    timeout?: number,
    maxRetries: number = DEFAULT_MAX_RETRIES,
    cacheTtl: number = DEFAULT_CACHE_TTL,
    skipRobots: boolean = false,
  ) {
    this.rateLimiter = new RateLimiter(rateLimit ?? DEFAULT_RATE_LIMIT);
    this.timeout = timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = maxRetries;
    this.cache = new TTLCache<string>(cacheTtl);
    this.skipRobots = skipRobots;
  }

  /**
   * Each scraper subclass must override this with its identifier.
   */
  get scraperName(): string {
    return "unknown-scraper";
  }

  /**
   * Returns provenance info from the most recent successful fetch().
   */
  getProvenance(): { scrapeAttempts: number; rawContentHash: string | null } {
    return {
      scrapeAttempts: this.lastFetchAttempts,
      rawContentHash: this.lastFetchHash,
    };
  }

  /**
   * Validate URL protocol and hostname to prevent SSRF attacks.
   * Only HTTP and HTTPS are allowed. Blocks private/internal IPs.
   * Exception: Allows configured RSSHub URL (localhost:1200) for local development.
   */
  protected validateUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return false;
      }
      
      // Allow configured RSSHub URL (typically localhost:1200)
      const rsshubUrl = process.env.RSSHUB_URL || "http://localhost:1200";
      const rsshubParsed = new URL(rsshubUrl);
      if (parsed.hostname === rsshubParsed.hostname && parsed.port === rsshubParsed.port) {
        return true;
      }
      
      const hostname = parsed.hostname;
      // Block localhost and loopback
      if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname)) {
        return false;
      }
      // Block private IP ranges (RFC 1918) and link-local
      if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(hostname)) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read response body with size limit to prevent memory exhaustion.
   * Throws if response exceeds MAX_RESPONSE_SIZE.
   */
  protected async readBodyWithLimit(response: Response): Promise<string> {
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      await response.body?.cancel();
      throw new Error(`Response too large: ${contentLength} bytes exceeds ${MAX_RESPONSE_SIZE} limit`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return await response.text();
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > MAX_RESPONSE_SIZE) {
        await reader.cancel();
        throw new Error(`Response exceeded ${MAX_RESPONSE_SIZE} byte limit`);
      }

      chunks.push(value);
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return new TextDecoder().decode(result);
  }

  /**
   * Check robots.txt to determine if scraping is allowed.
   */
  protected async canScrape(url: string): Promise<boolean> {
    if (!this.validateUrl(url)) {
      logger.warn("Invalid URL protocol", { url });
      return false;
    }

    const parsed = new URL(url);
    const baseUrl = `${parsed.protocol}//${parsed.host}`;
    const robotsUrl = `${baseUrl}/robots.txt`;

    const now = Date.now();

    // Periodic cleanup of expired robots.txt cache entries (throttled to once per hour)
    if (now - BaseScraper.lastRobotsCleanupTime > BaseScraper.CLEANUP_INTERVAL_MS) {
      BaseScraper.lastRobotsCleanupTime = now;
      for (const [domain, entry] of BaseScraper.robotsCache.entries()) {
        if (entry.expiresAt <= now) {
          BaseScraper.robotsCache.delete(domain);
        }
      }
    }

    const cached = BaseScraper.robotsCache.get(baseUrl);

    if (cached && cached.expiresAt > now) {
      return cached.parser.isAllowed(url, "*") ?? true;
    }

    // Evict oldest entries if cache is full
    if (BaseScraper.robotsCache.size >= MAX_ROBOTS_CACHE_SIZE && !cached) {
      const firstKey = BaseScraper.robotsCache.keys().next().value;
      if (firstKey) BaseScraper.robotsCache.delete(firstKey);
    }

    try {
      const response = await fetch(robotsUrl, {
        headers: { "User-Agent": BaseScraper.USER_AGENT },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (response.ok) {
        const text = await this.readBodyWithLimit(response);
        const robots = robotsParser(robotsUrl, text);
        BaseScraper.robotsCache.set(baseUrl, {
          parser: robots,
          expiresAt: now + BaseScraper.ROBOTS_CACHE_TTL_MS,
        });
        return robots.isAllowed(url, "*") ?? true;
      } else {
        await response.body?.cancel();
        return true;
      }
    } catch (error) {
      logger.warn("Failed to fetch robots.txt", { url: robotsUrl, error: String(error) });
      return true;
    }
  }

  /**
   * Check if a domain is circuit-broken (too many consecutive failures).
   */
  private isDomainCircuitBroken(url: string): boolean {
    // Periodic cleanup of expired entries (throttled to once per hour)
    const now = Date.now();
    if (now - BaseScraper.lastCleanupTime > BaseScraper.CLEANUP_INTERVAL_MS) {
      BaseScraper.lastCleanupTime = now;
      for (const [domain, state] of BaseScraper.domainFailures.entries()) {
        if (now - state.lastFailure > BaseScraper.CIRCUIT_BREAKER_COOLDOWN_MS) {
          BaseScraper.domainFailures.delete(domain);
        }
      }
    }

    const domain = this.extractDomain(url);
    const state = BaseScraper.domainFailures.get(domain);
    if (!state) return false;
    if (state.count < BaseScraper.CIRCUIT_BREAKER_THRESHOLD) return false;
    const elapsed = now - state.lastFailure;
    return elapsed < BaseScraper.CIRCUIT_BREAKER_COOLDOWN_MS;
  }

  /**
   * Record a failure for a domain.
   */
  private recordDomainFailure(url: string): void {
    const domain = this.extractDomain(url);
    const now = Date.now();

    if (now - BaseScraper.lastCleanupTime > BaseScraper.CLEANUP_INTERVAL_MS) {
      BaseScraper.lastCleanupTime = now;
      for (const [d, s] of BaseScraper.domainFailures.entries()) {
        if (now - s.lastFailure > BaseScraper.CIRCUIT_BREAKER_COOLDOWN_MS) {
          BaseScraper.domainFailures.delete(d);
        }
      }
    }

    const state = BaseScraper.domainFailures.get(domain) ?? { count: 0, lastFailure: 0 };
    state.count++;
    state.lastFailure = now;
    BaseScraper.domainFailures.set(domain, state);

    if (BaseScraper.domainFailures.size > BaseScraper.DOMAIN_FAILURES_MAX_SIZE) {
      const excess = BaseScraper.domainFailures.size - BaseScraper.DOMAIN_FAILURES_MAX_SIZE;
      const keys = BaseScraper.domainFailures.keys();
      for (let i = 0; i < excess; i++) {
        const result = keys.next();
        if (result.done) break;
        BaseScraper.domainFailures.delete(result.value);
      }
    }

    if (state.count >= BaseScraper.CIRCUIT_BREAKER_THRESHOLD) {
      logger.warn("scraper.domain_circuit_breaker.open", { domain, failures: state.count });
    }
  }

  /**
   * Record a success for a domain (reset failure count).
   */
  private recordDomainSuccess(url: string): void {
    const domain = this.extractDomain(url);
    BaseScraper.domainFailures.delete(domain);
  }

  /**
   * Extract domain from URL for circuit breaker tracking.
   */
  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  /**
   * Fetch a URL with rate limiting, caching, retry, and robots.txt compliance.
   * Returns the response text, or null if the request failed after retries.
   * Updates lastFetchAttempts and lastFetchHash on success.
   */
  async fetch(url: string): Promise<string | null> {
    if (!this.validateUrl(url)) {
      logger.warn("Invalid URL protocol", { url });
      return null;
    }

    // Check domain-level circuit breaker
    if (this.isDomainCircuitBroken(url)) {
      const domain = this.extractDomain(url);
      logger.info("scraper.domain_circuit_breaker.skip", { url, domain });
      return null;
    }

    const cached = await this.cache.get(url);
    if (cached !== null) {
      logger.debug("Cache hit", { url });
      this.lastFetchAttempts = 1;
      this.lastFetchHash = createHash("sha256").update(cached).digest("hex");
      return cached;
    }

    if (!this.skipRobots && !(await this.canScrape(url))) {
      logger.info("Blocked by robots.txt", { url });
      return null;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      await this.rateLimiter.wait();

      let response: Response | undefined;
      try {
        response = await fetch(url, {
          headers: { "User-Agent": BaseScraper.USER_AGENT },
          signal: AbortSignal.timeout(this.timeout),
          redirect: "follow",
        });

        if (response.ok) {
          const text = await this.readBodyWithLimit(response);
          await this.cache.set(url, text);
          this.lastFetchAttempts = attempt;
          this.lastFetchHash = createHash("sha256").update(text).digest("hex");
          this.recordDomainSuccess(url);
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

          // Consume body to release connection
          await response.body?.cancel();

          await new Promise((r) => setTimeout(r, waitTime));
          continue;
        }

        // Consume body to release connection before throwing
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error) {
        lastError = error as Error;
        const waitTime = Math.min(2 ** attempt * 1000, 60000);

        // Cancel response body if still open (e.g. timeout during streaming)
        try { await response?.body?.cancel(); } catch { /* ignore */ }

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

    // Record domain failure for circuit breaker
    this.recordDomainFailure(url);

    return null;
  }
}
