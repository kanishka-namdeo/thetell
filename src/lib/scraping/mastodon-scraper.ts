/**
 * Dedicated Mastodon scraper for corporate intelligence.
 * Discovers social signals across multiple Mastodon instances.
 *
 * Key features:
 * - Multi-instance coverage (each instance only sees federated content)
 * - Hashtag-based discovery for targeted topics
 * - Public timeline scraping for broad coverage
 * - No authentication required for public endpoints
 * - Rate limiting and compliance with instance ToS
 */

import { BaseScraper } from "./base-scraper";
import { logger } from "@/lib/logger";
import * as cheerio from "cheerio";

export interface MastodonPost {
  url: string;
  platform: "mastodon";
  author: string;
  authorUrl: string;
  bodyText: string;
  publishedAt: Date | null;
  engagement: {
    likes: number | null;
    retweets: number | null;
    replies: number | null;
  };
  metadata: {
    source: string;
    instance: string;
    statusId: string;
    authorAcct: string;
  };
}

// Strategic Mastodon instances for corporate signal discovery
// Each instance has different federation patterns and user demographics
const MASTODON_INSTANCES = [
  "mastodon.social",      // Flagship (largest, ~281K+ users)
  "fosstodon.org",        // FOSS/tech focus
  "hachyderm.io",         // IT professionals
  "mas.to",               // General tech
  "infosec.exchange",     // Security professionals
  "techhub.social",       // Tech community
];

// Hashtags relevant for corporate intelligence
const CORPORATE_HASHTAGS = [
  "tech",
  "business",
  "startup",
  "layoffs",
  "earnings",
  "ai",
  "crypto",
  "fintech",
];

export class MastodonScraper extends BaseScraper {
  constructor() {
    // Rate limit: 1 request per 2 seconds per instance (well below 300/5min limit)
    super(0.5, 30000, 3, 86400, true);
  }

  override get scraperName(): string {
    return "mastodon-scraper";
  }

  /**
   * Main scrape method - discovers social signals for given company tickers.
   * Searches across multiple instances and hashtags.
   */
  async scrape(tickers: string[], options?: { limit?: number }): Promise<MastodonPost[]> {
    const limit = options?.limit ?? 80;
    const results: MastodonPost[] = [];

    logger.info("mastodon.scrape.start", {
      tickerCount: tickers.length,
      instanceCount: MASTODON_INSTANCES.length,
    });

    // Search by company tickers across instances
    for (const ticker of tickers) {
      if (results.length >= limit) break;

      for (const instance of MASTODON_INSTANCES) {
        if (results.length >= limit) break;

        try {
          const posts = await this.searchInstance(instance, ticker, Math.min(limit - results.length, 20));
          results.push(...posts);
        } catch (error) {
          logger.debug("Mastodon ticker search failed", {
            ticker,
            instance,
            error: String(error),
          });
        }
      }
    }

    // Also search by relevant hashtags for broader coverage
    for (const hashtag of CORPORATE_HASHTAGS) {
      if (results.length >= limit) break;

      try {
        const posts = await this.scrapeHashtag(hashtag, Math.min(limit - results.length, 5));
        results.push(...posts);
      } catch (error) {
        logger.debug("Mastodon hashtag scrape failed", {
          hashtag,
          error: String(error),
        });
      }
    }

    logger.info("mastodon.scrape.complete", {
      tickersSearched: tickers.length,
      hashtagsSearched: CORPORATE_HASHTAGS.length,
      resultsFound: results.length,
    });

    return results.slice(0, limit);
  }

  /**
   * Search a specific Mastodon instance for a query.
   * Uses the public search endpoint (no auth required on most instances).
   */
  private async searchInstance(
    instance: string,
    query: string,
    limit: number = 10,
  ): Promise<MastodonPost[]> {
    const results: MastodonPost[] = [];

    try {
      const searchUrl = `https://${instance}/api/v2/search?q=${encodeURIComponent(query)}&type=statuses&limit=${limit}`;
      const text = await this.fetch(searchUrl);
      if (text === null) return [];

      const data = JSON.parse(text) as {
        statuses?: Array<{
          id: string;
          url: string;
          content: string;
          created_at: string;
          account: {
            username: string;
            acct: string;
            display_name: string;
            url: string;
          };
          favourites_count: number;
          reblogs_count: number;
          replies_count: number;
        }>;
      };

      if (!data.statuses) return [];

      for (const status of data.statuses) {
        if (!status.id || !status.content || !status.url) continue;

        const plainContent = cheerio.load(status.content).text().trim();
        if (!plainContent) continue;

        results.push({
          url: status.url,
          platform: "mastodon",
          author: status.account.display_name || status.account.username || "[anonymous]",
          authorUrl: status.account.url || `https://${instance}/@${status.account.acct.split("@")[0]}`,
          bodyText: plainContent,
          publishedAt: status.created_at ? new Date(status.created_at) : null,
          engagement: {
            likes: status.favourites_count ?? null,
            retweets: status.reblogs_count ?? null,
            replies: status.replies_count ?? null,
          },
          metadata: {
            source: "mastodon-search",
            instance,
            statusId: status.id,
            authorAcct: status.account.acct,
          },
        });
      }
    } catch (error) {
      logger.debug("Mastodon instance search failed", {
        instance,
        query,
        error: String(error),
      });
    }

    return results;
  }

  /**
   * Scrape posts by hashtag from multiple instances.
   */
  private async scrapeHashtag(
    hashtag: string,
    limit: number = 10,
  ): Promise<MastodonPost[]> {
    const results: MastodonPost[] = [];
    const cleanHashtag = hashtag.replace(/^#/, "");

    for (const instance of MASTODON_INSTANCES) {
      if (results.length >= limit) break;

      try {
        const apiUrl = `https://${instance}/api/v1/timelines/tag/${encodeURIComponent(cleanHashtag)}?limit=${Math.min(limit - results.length, 20)}`;
        const text = await this.fetch(apiUrl);
        if (text === null) continue;

        const statuses = JSON.parse(text) as Array<{
          id: string;
          content: string;
          url: string;
          created_at: string;
          account: {
            username: string;
            acct: string;
            display_name: string;
            url: string;
          };
          favourites_count: number;
          reblogs_count: number;
          replies_count: number;
        }>;

        for (const status of statuses) {
          if (!status.id || !status.content || !status.url) continue;

          const plainContent = cheerio.load(status.content).text().trim();
          if (!plainContent) continue;

          results.push({
            url: status.url,
            platform: "mastodon",
            author: status.account.display_name || status.account.username || "[anonymous]",
            authorUrl: status.account.url || `https://${instance}/@${status.account.acct.split("@")[0]}`,
            bodyText: plainContent,
            publishedAt: status.created_at ? new Date(status.created_at) : null,
            engagement: {
              likes: status.favourites_count ?? null,
              retweets: status.reblogs_count ?? null,
              replies: status.replies_count ?? null,
            },
            metadata: {
              source: "mastodon-hashtag",
              instance,
              statusId: status.id,
              authorAcct: status.account.acct,
            },
          });
        }
      } catch (error) {
        logger.debug("Mastodon hashtag scrape failed", {
          instance,
          hashtag: cleanHashtag,
          error: String(error),
        });
        continue;
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Get the list of tracked instances.
   */
  getTrackedInstances(): string[] {
    return [...MASTODON_INSTANCES];
  }
}
