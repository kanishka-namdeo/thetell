/**
 * App Store scraper using Apple's public RSS feeds.
 * Monitors app listings, category changes, and new releases via
 * rss.applemarketingtools.com RSS feeds.
 *
 * Signal value: product launches, platform strategy shifts,
 * category expansion, competitive positioning.
 */

import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";
import { normalizeUrl, computeContentHash } from "./url-normalizer";

export interface AppStoreSignal {
  id: string;
  type: "app_new" | "app_updated" | "app_featured" | "category_change";
  appName: string;
  developer: string;
  category: string;
  url: string;
  title: string;
  description: string;
  publishedAt: Date;
  metadata: Record<string, string | number | boolean>;
  contentHash: string;
}

interface RSSFeedItem {
  title: string;
  link: string;
  category: string;
  description: string;
  pubDate: string;
}

export class AppStoreScraper extends BaseScraper {
  private readonly FEED_URLS = {
    topFree: "https://rss.applemarketingtools.com/api/v2/us/apps/top-free/50/rss.json",
    topPaid: "https://rss.applemarketingtools.com/api/v2/us/apps/top-paid/50/rss.json",
    recent: "https://rss.applemarketingtools.com/api/v2/us/apps/most-recent/50/rss.json",
  };

  constructor() {
    super(1.0, 30000, 3, 3600); // 1 hour cache
  }

  override get scraperName(): string {
    return "app-store-scraper";
  }

  async scrape(companyName?: string): Promise<AppStoreSignal[]> {
    logger.info("Starting App Store scrape", { companyName: companyName || "all" });

    const signals: AppStoreSignal[] = [];

    try {
      const topFree = await this.fetchFeed("topFree", companyName);
      signals.push(...topFree);

      const topPaid = await this.fetchFeed("topPaid", companyName);
      signals.push(...topPaid);

      const recent = await this.fetchFeed("recent", companyName);
      signals.push(...recent);

      logger.info("App Store scrape completed", {
        companyName: companyName || "all",
        signalCount: signals.length,
      });
    } catch (error) {
      logger.error("App Store scrape failed", {
        companyName: companyName || "all",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return signals;
  }

  private async fetchFeed(
    feedType: keyof typeof this.FEED_URLS,
    companyName?: string
  ): Promise<AppStoreSignal[]> {
    const url = this.FEED_URLS[feedType];
    const text = await this.fetch(url);

    if (!text) {
      logger.warn("Failed to fetch App Store feed", { feedType });
      return [];
    }

    try {
      const data = JSON.parse(text);
      const items = this.parseRSSFeed(data);
      return this.processItems(items, feedType, companyName);
    } catch (error) {
      logger.error("Failed to parse App Store feed", {
        feedType,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private parseRSSFeed(data: Record<string, unknown>): RSSFeedItem[] {
    const items: RSSFeedItem[] = [];
    const feed = data.feed as Record<string, unknown> | undefined;

    if (feed?.entry) {
      const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];

      for (const entry of entries) {
        const title = entry["im:name"]?.label || "";
        const link = entry.link?.[0]?.attributes?.href || entry.link?.attributes?.href || "";
        const category = entry.category?.attributes?.label || "";
        const summary = entry.summary?.label || "";
        const pubDate = entry["im:releaseDate"]?.label || new Date().toISOString();

        if (title && link) {
          items.push({ title, link, category, description: summary, pubDate });
        }
      }
    }

    return items;
  }

  private processItems(
    items: RSSFeedItem[],
    feedType: string,
    companyName?: string
  ): AppStoreSignal[] {
    const signals: AppStoreSignal[] = [];

    for (const item of items.slice(0, 20)) {
      const developer = this.extractDeveloper(item.description, item.link);

      if (companyName) {
        const matchesDeveloper = developer.toLowerCase().includes(companyName.toLowerCase());
        const matchesApp = item.title.toLowerCase().includes(companyName.toLowerCase());
        if (!matchesDeveloper && !matchesApp) continue;
      }

      const signalType = this.determineSignalType(feedType);
      const normalizedUrl = normalizeUrl(item.link);
      const content = JSON.stringify({
        appName: item.title,
        developer,
        category: item.category,
        link: item.link,
      });

      signals.push({
        id: `appstore-${Buffer.from(item.link).toString("base64").slice(0, 16)}`,
        type: signalType,
        appName: item.title,
        developer,
        category: item.category,
        url: item.link,
        title: `${item.title} by ${developer}`,
        description: item.description.slice(0, 500),
        publishedAt: new Date(item.pubDate),
        metadata: {
          category: item.category,
          developer,
          source: "apple-rss",
          feedType,
        },
        contentHash: computeContentHash(normalizedUrl, content),
      });
    }

    return signals;
  }

  private determineSignalType(feedType: string): AppStoreSignal["type"] {
    switch (feedType) {
      case "recent":
        return "app_new";
      case "topFree":
      case "topPaid":
        return "app_featured";
      default:
        return "app_updated";
    }
  }

  private extractDeveloper(description: string, url: string): string {
    const devMatch = description.match(/By\s+([A-Za-z0-9\s]+?)(?:\.|\s*$)/i);
    if (devMatch) return devMatch[1].trim();

    const urlMatch = url.match(/developer\/([^\/]+)/i);
    if (urlMatch) return decodeURIComponent(urlMatch[1]);

    return "Unknown Developer";
  }
}
