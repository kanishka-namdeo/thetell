/**
 * Adaptive scraper with three-tier fallback chain.
 * Tries fast HTTP scraper first, then Jina Reader (headless Chrome), then stealth browser.
 */

import { logger } from "@/lib/logger";
import { StealthBrowserScraper } from "./stealth-browser-scraper";
import { JinaReaderScraper } from "./jina-reader-scraper";
import type { ArticleData } from "./news-scraper";

/**
 * Minimum content length threshold for usable content.
 * Content shorter than this is considered unusable and triggers fallback.
 */
const MIN_CONTENT_LENGTH = 500;

/**
 * Result of adaptive scraping attempt.
 */
export interface AdaptiveScrapeResult {
  article: ArticleData | null;
  method: "fast" | "jina" | "stealth" | "failed";
  fastContentLength?: number;
  jinaContentLength?: number;
  stealthContentLength?: number;
  reason?: string;
}

/**
 * Scrape a URL with automatic three-tier fallback.
 *
 * Strategy:
 * 1. Try fast HTTP scraper (BlogScraper, NewsScraper, etc.)
 * 2. If content is too short or missing, try Jina Reader (self-hosted headless Chrome)
 * 3. If Jina Reader fails, try stealth browser (CloakBrowser)
 * 4. Return best result with metadata about which method succeeded
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

  // Step 1: Try fast HTTP scraper
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

  // Step 2: Try Jina Reader (self-hosted headless Chrome)
  log.info("adaptive_scrape.try_jina");
  const jinaScraper = new JinaReaderScraper();

  let jinaArticle: ArticleData | null = null;
  let jinaContentLength = 0;

  if (jinaScraper.isEnabled()) {
    try {
      jinaArticle = await jinaScraper.scrapeArticle(url);
      jinaContentLength = jinaArticle?.bodyText?.length || 0;

      log.info("adaptive_scrape.jina_complete", {
        success: jinaArticle !== null,
        contentLength: jinaContentLength,
      });

      if (jinaArticle && jinaContentLength >= MIN_CONTENT_LENGTH) {
        return {
          article: jinaArticle,
          method: "jina",
          fastContentLength,
          jinaContentLength,
        };
      }

      log.warn("adaptive_scrape.jina_unusable", {
        contentLength: jinaContentLength,
      });
    } catch (error) {
      log.error("adaptive_scrape.jina_error", { error: String(error) });
    }
  } else {
    log.debug("adaptive_scrape.jina_disabled");
  }

  // Step 3: Fall back to stealth browser (CloakBrowser)
  log.info("adaptive_scrape.try_stealth");
  const stealthScraper = new StealthBrowserScraper();

  let stealthArticle: ArticleData | null = null;
  let stealthContentLength = 0;

  if (stealthScraper.isEnabled()) {
    try {
      stealthArticle = await stealthScraper.scrapeArticle(url);
      stealthContentLength = stealthArticle?.bodyText?.length || 0;

      log.info("adaptive_scrape.stealth_complete", {
        success: stealthArticle !== null,
        contentLength: stealthContentLength,
      });

      if (stealthArticle && stealthContentLength >= MIN_CONTENT_LENGTH) {
        return {
          article: stealthArticle,
          method: "stealth",
          fastContentLength,
          jinaContentLength,
          stealthContentLength,
        };
      }

      log.warn("adaptive_scrape.stealth_unusable", {
        contentLength: stealthContentLength,
      });
    } catch (error) {
      log.error("adaptive_scrape.stealth_error", { error: String(error) });
    }
  } else {
    log.warn("adaptive_scrape.stealth_disabled");
  }

  // Step 4: All methods failed or content unusable
  log.warn("adaptive_scrape.all_failed", {
    fastContentLength,
    jinaContentLength,
    stealthContentLength,
  });

  return {
    article: stealthArticle || jinaArticle || fastArticle,
    method: "failed",
    fastContentLength,
    jinaContentLength,
    stealthContentLength,
    reason: "all_methods_failed",
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
