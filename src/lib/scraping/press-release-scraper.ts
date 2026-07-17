/**
 * Press release wire scraper for tracking corporate announcements.
 * Monitors Business Wire, PR Newswire, and GlobeNewswire RSS feeds.
 * Signal value: earnings announcements, M&A, partnerships, executive changes,
 * product launches.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";
import { normalizeUrl, computeContentHash } from "./url-normalizer";

/**
 * Signal type representing a press release.
 */
export interface PressReleaseSignal {
  id: string;
  type: "press_release";
  source: "business_wire" | "pr_newswire" | "globenewswire";
  url: string;
  title: string;
  description: string;
  bodyText: string;
  publishedAt: Date | null;
  metadata: Record<string, string | number | boolean>;
  contentHash: string;
}

/**
 * Press release wire service RSS feed configuration.
 */
interface WireServiceConfig {
  name: PressReleaseSignal["source"];
  feedUrl: string;
  displayName: string;
}

/**
 * Default wire service feeds to monitor.
 */
const DEFAULT_WIRE_SERVICES: WireServiceConfig[] = [
  {
    name: "business_wire",
    feedUrl: "https://www.businesswire.com/portal/site/en/home/rss/businesswire-en.xml",
    displayName: "Business Wire",
  },
  {
    name: "pr_newswire",
    feedUrl: "https://www.prnewswire.com/rss/financial-services-latest-news/financial-services-latest-news.rss",
    displayName: "PR Newswire",
  },
  {
    name: "globenewswire",
    feedUrl: "https://www.globenewswire.com/Rss/TopNews",
    displayName: "GlobeNewswire",
  },
];

/**
 * Common English words that look like ticker symbols but aren't.
 * Hoisted to module scope to avoid recreating the Set on every call.
 */
const TICKER_BLOCKLIST = new Set([
  "THE", "AND", "FOR", "WITH", "FROM",
  "INC", "CORP", "LTD", "LLC",
]);
export class PressReleaseScraper extends BaseScraper {
  constructor() {
    // RSS feeds are typically static and can be cached longer
    super(1.0, 30000, 3, 3600); // 1 hour cache
  }

  override get scraperName(): string {
    return "press-release-scraper";
  }

  /**
   * Scrape press release wires for signals.
   */
  async scrape(): Promise<PressReleaseSignal[]> {
    logger.info("Starting press release wire scrape");

    const signals: PressReleaseSignal[] = [];

    try {
      for (const wireService of DEFAULT_WIRE_SERVICES) {
        const wireSignals = await this.scrapeWireService(wireService);
        if (wireSignals) {
          signals.push(...wireSignals);
        }
      }

      logger.info("Press release scrape completed", {
        signalCount: signals.length,
      });
    } catch (error) {
      logger.error("Press release scrape failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return signals;
  }

  /**
   * Scrape a single wire service RSS feed.
   */
  private async scrapeWireService(
    wireService: WireServiceConfig
  ): Promise<PressReleaseSignal[] | null> {
    logger.debug("Scraping wire service", {
      name: wireService.name,
      feedUrl: wireService.feedUrl,
    });

    const xml = await this.fetch(wireService.feedUrl);
    if (!xml) {
      logger.warn("Failed to fetch wire service RSS", {
        name: wireService.name,
      });
      return null;
    }

    try {
      return this.parseRssFeed(xml, wireService);
    } catch (error) {
      logger.error("Failed to parse wire service RSS", {
        name: wireService.name,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Parse RSS feed and extract press releases as signals.
   */
  private parseRssFeed(
    xml: string,
    wireService: WireServiceConfig
  ): PressReleaseSignal[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const signals: PressReleaseSignal[] = [];

    $("item").each((_, element) => {
      const item = $(element);

      const title = item.find("title").first().text().trim();
      const link = item.find("link").first().text().trim();
      const description = item.find("description").first().text().trim();
      const pubDate = item.find("pubDate").first().text().trim();
      const guid = item.find("guid").first().text().trim();

      if (!title || !link) return;

      const normalizedUrl = normalizeUrl(link);
      const content = JSON.stringify({
        title,
        guid: guid || link,
        pubDate,
      });

      signals.push({
        id: `press-${wireService.name}-${guid || link}`,
        type: "press_release",
        source: wireService.name,
        url: link,
        title,
        description,
        bodyText: description,
        publishedAt: pubDate ? this.parseDate(pubDate) : null,
        metadata: {
          source: wireService.name,
          displayName: wireService.displayName,
          guid,
          mentions: this.extractCompanyMentions(title + " " + description).join(","),
        },
        contentHash: computeContentHash(normalizedUrl, content),
      });
    });

    logger.debug("Parsed wire service RSS", {
      source: wireService.name,
      releaseCount: signals.length,
    });

    return signals;
  }

  /**
   * Parse date string from RSS feed.
   */
  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }

    logger.warn("Failed to parse date", { dateStr });
    return null;
  }

  /**
   * Extract company mentions from press release text.
   * Looks for common company names and ticker symbols.
   */
  private extractCompanyMentions(text: string): string[] {
    const mentions: string[] = [];

    // Look for ticker symbols in parentheses: (NYSE: AAPL) or (NASDAQ: MSFT)
    const tickerMatches = text.match(/\((?:NYSE|NASDAQ|AMEX):\s*([A-Z]+)\)/gi);
    if (tickerMatches) {
      mentions.push(...tickerMatches.map((m) => m.replace(/[()]/g, "")));
    }

    // Look for standalone ticker symbols
    const standaloneTickers = text.match(/\b[A-Z]{2,5}\b/g);
    if (standaloneTickers) {
      // Filter out common words
      const filtered = standaloneTickers.filter((t) => !TICKER_BLOCKLIST.has(t));
      mentions.push(...filtered);
    }

    return [...new Set(mentions)];
  }
}
