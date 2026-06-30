/**
 * Adaptive scraper with automatic fallback to stealth browser.
 * Tries fast HTTP scraper first, then falls back to stealth browser if content is unusable.
 */

import { logger } from "@/lib/logger";
import { StealthBrowserScraper } from "./stealth-browser-scraper";
import type { ArticleData } from "./news-scraper";

/**
 * Minimum content length threshold for usable content.
 * Content shorter than this is considered unusable and triggers stealth fallback.
 */
const MIN_CONTENT_LENGTH = 500;

/**
 * Result of adaptive scraping attempt.
 */
export interface AdaptiveScrapeResult {
  article: ArticleData | null;
  method: "fast" | "stealth" | "failed";
  fastContentLength?: number;
  stealthContentLength?: number;
  reason?: string;
}

/**
 * Scrape a URL with automatic fallback to stealth browser.
 * 
 * Strategy:
 * 1. Try fast HTTP scraper (BlogScraper, NewsScraper, etc.)
 * 2. If content is too short or missing, try stealth browser
 * 3. Return best result with metadata about which method succeeded
 * 
 * @param url - URL to scrape
 * @param fastScraper - Fast HTTP-based scraper function (e.g., blogScraper.scrapeArticle)
 * @returns AdaptiveScrapeResult with article, method used, and content lengths
 */
export async function scrapeWithFallback(
  url: string,
  fastScraper: (url: string) => Promise<ArticleData | null>
): Promise<AdaptiveScrapeResult> {
  const log = logger.child({ function: "scrapeWithFallback", url });

  log.info("adaptive_scrape.start");

  // Step 1: Try fast scraper
  let fastArticle: ArticleData | null = null;
  let fastContentLength = 0;

  try {
    log.debug("adaptive_scrape.try_fast");
    fastArticle = await fastScraper(url);
    fastContentLength = fastArticle?.bodyText?.length || 0;

    log.info("adaptive_scrape.fast_complete", {
      success: fastArticle !== null,
      contentLength: fastContentLength,
    });

    // If fast scraper succeeded and content is usable, return it
    if (fastArticle && fastContentLength >= MIN_CONTENT_LENGTH) {
      return {
        article: fastArticle,
        method: "fast",
        fastContentLength,
      };
    }

    log.info("adaptive_scrape.fast_unusable", {
      reason: fastArticle ? "content_too_short" : "scrape_failed",
      contentLength: fastContentLength,
    });
  } catch (error) {
    log.warn("adaptive_scrape.fast_error", { error: String(error) });
  }

  // Step 2: Fall back to stealth browser
  log.info("adaptive_scrape.try_stealth");
  const stealthScraper = new StealthBrowserScraper();

  if (!stealthScraper.isEnabled()) {
    log.warn("adaptive_scrape.stealth_disabled");
    return {
      article: fastArticle, // Return fast result even if unusable
      method: "failed",
      fastContentLength,
      reason: "stealth_scraper_disabled",
    };
  }

  let stealthArticle: ArticleData | null = null;
  let stealthContentLength = 0;

  try {
    stealthArticle = await stealthScraper.scrapeArticle(url);
    stealthContentLength = stealthArticle?.bodyText?.length || 0;

    log.info("adaptive_scrape.stealth_complete", {
      success: stealthArticle !== null,
      contentLength: stealthContentLength,
    });

    // If stealth succeeded and content is better, return it
    if (stealthArticle && stealthContentLength >= MIN_CONTENT_LENGTH) {
      return {
        article: stealthArticle,
        method: "stealth",
        fastContentLength,
        stealthContentLength,
      };
    }

    log.warn("adaptive_scrape.stealth_unusable", {
      contentLength: stealthContentLength,
    });
  } catch (error) {
    log.error("adaptive_scrape.stealth_error", { error: String(error) });
  }

  // Step 3: Both failed or content unusable
  log.warn("adaptive_scrape.both_failed", {
    fastContentLength,
    stealthContentLength,
  });

  return {
    article: stealthArticle || fastArticle, // Return best effort
    method: "failed",
    fastContentLength,
    stealthContentLength,
    reason: "both_methods_failed",
  };
}

/**
 * Check if content is usable (meets minimum quality threshold).
 */
export function isContentUsable(article: ArticleData | null): boolean {
  if (!article) return false;
  const length = article.bodyText?.length || 0;
  return length >= MIN_CONTENT_LENGTH;
}
