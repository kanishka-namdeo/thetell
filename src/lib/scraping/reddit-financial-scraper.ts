/**
 * Reddit financial subreddit scraper for tracking retail sentiment.
 * Monitors r/wallstreetbets, r/stocks, r/investing, and ticker-specific subreddits.
 * Signal value: retail sentiment, short interest signals, viral stock movements.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { BaseScraper } from "./base-scraper";
import { normalizeUrl, computeContentHash } from "./url-normalizer";

/**
 * Signal type representing a Reddit financial post.
 */
export interface RedditFinancialSignal {
  id: string;
  type: "reddit_post";
  subreddit: string;
  url: string;
  title: string;
  description: string;
  bodyText: string;
  publishedAt: Date | null;
  engagement: {
    score: number;
    upvoteRatio: number;
    comments: number;
  };
  author: string | null;
  metadata: Record<string, string | number | boolean>;
  contentHash: string;
}

/**
 * Default financial subreddits to monitor.
 */
const DEFAULT_SUBREDDITS = ["wallstreetbets", "stocks", "investing"];

export class RedditFinancialScraper extends BaseScraper {
  private readonly redditBase = "https://www.reddit.com";

  constructor() {
    super(1.0, 30000, 3, 3600, true);
  }

  override get scraperName(): string {
    return "reddit-financial-scraper";
  }

  /**
   * Scrape financial subreddits for signals.
   * @param tickers - Optional array of stock tickers to discover ticker-specific subreddits
   */
  async scrape(tickers?: string[]): Promise<RedditFinancialSignal[]> {
    logger.info("Starting Reddit financial scrape", { tickers });

    const signals: RedditFinancialSignal[] = [];
    const subreddits = [...DEFAULT_SUBREDDITS];

    // Add ticker-specific subreddits
    if (tickers && tickers.length > 0) {
      for (const ticker of tickers) {
        const tickerSub = ticker.toLowerCase();
        if (!subreddits.includes(tickerSub)) {
          subreddits.push(tickerSub);
        }
      }
    }

    try {
      for (const subreddit of subreddits) {
        const posts = await this.scrapeSubreddit(subreddit);
        if (posts) {
          signals.push(...posts);
        }
      }

      logger.info("Reddit financial scrape completed", {
        subredditsScraped: subreddits.length,
        signalCount: signals.length,
      });
    } catch (error) {
      logger.error("Reddit financial scrape failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return signals;
  }

  /**
   * Scrape subreddits for specific companies by combining defaults, tracked subreddits from DB,
   * and ticker-based subreddits.
   */
  async scrapeForCompanies(
    companies: Array<{ id: string; ticker?: string | null }>
  ): Promise<RedditFinancialSignal[]> {
    const companyIds = companies.map((c) => c.id);
    logger.info("Starting Reddit scrape for companies", { companyIds });

    const trackedSubs = await prisma.trackedSubreddit.findMany({
      where: { companyId: { in: companyIds }, isActive: true },
      select: { subreddit: true },
    });

    const trackedNames = [...new Set(trackedSubs.map((s) => s.subreddit))];

    const allSubreddits = [
      ...new Set([
        ...DEFAULT_SUBREDDITS,
        ...trackedNames,
        ...companies
          .filter((c) => c.ticker)
          .map((c) => c.ticker!.toLowerCase()),
      ]),
    ];

    const signals: RedditFinancialSignal[] = [];

    try {
      for (const subreddit of allSubreddits) {
        const posts = await this.scrapeSubreddit(subreddit);
        if (posts) signals.push(...posts);
      }

      logger.info("Reddit financial scrape completed", {
        subredditsScraped: allSubreddits.length,
        signalCount: signals.length,
      });
    } catch (error) {
      logger.error("Reddit financial scrape failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return signals;
  }

  /**
   * Scrape a single subreddit's RSS feed.
   */
  private async scrapeSubreddit(
    subreddit: string
  ): Promise<RedditFinancialSignal[] | null> {
    const feedUrl = `${this.redditBase}/r/${subreddit}/.rss`;
    logger.debug("Scraping subreddit RSS", { subreddit, feedUrl });

    const xml = await this.fetch(feedUrl);
    if (!xml) {
      logger.warn("Failed to fetch subreddit RSS", { subreddit });
      return null;
    }

    try {
      return this.parseRssFeed(xml, subreddit);
    } catch (error) {
      logger.error("Failed to parse subreddit RSS", {
        subreddit,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Parse RSS feed and extract posts as signals.
   */
  private parseRssFeed(
    xml: string,
    subreddit: string
  ): RedditFinancialSignal[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const signals: RedditFinancialSignal[] = [];

    $("entry").each((_, element) => {
      const entry = $(element);

      const title = entry.find("title").first().text().trim();
      const link = entry.find("link").first().attr("href") || "";
      const content = entry.find("content").first().text();
      const published = entry.find("published").first().text();
      const id = entry.find("id").first().text();
      const author = entry.find("author name").first().text().trim() || entry.find("dc|creator").first().text().trim() || null;

      if (!title || !link) return;

      // Extract engagement from Reddit RSS (if available)
      const score = this.extractScore(content);
      const comments = this.extractCommentCount(content);
      const upvoteRatio = this.extractUpvoteRatio(content);

      // Extract body text from HTML content
      const bodyText = cheerio.load(content).text().trim();

      const normalizedUrl = normalizeUrl(link);
      const contentHash = computeContentHash(
        normalizedUrl,
        JSON.stringify({ title, id })
      );

      signals.push({
        id: `reddit-${subreddit}-${id || link}`,
        type: "reddit_post",
        subreddit,
        url: link,
        title,
        description: bodyText.slice(0, 500),
        bodyText,
        publishedAt: published ? this.parseDate(published) : null,
        engagement: {
          score,
          upvoteRatio,
          comments,
        },
        author,
        metadata: {
          subreddit,
          postId: id,
          score,
          comments,
        },
        contentHash,
      });
    });

    logger.debug("Parsed subreddit RSS", {
      subreddit,
      postCount: signals.length,
    });

    return signals;
  }

  /**
   * Extract score from Reddit RSS content.
   */
  private extractScore(content: string): number {
    const match = content.match(/score:\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Extract comment count from Reddit RSS content.
   */
  private extractCommentCount(content: string): number {
    const match = content.match(/comments?:\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Extract upvote ratio from Reddit RSS content.
   */
  private extractUpvoteRatio(content: string): number {
    const match = content.match(/upvote ratio:\s*(\d+(?:\.\d+)?)%?/i);
    if (match) {
      const ratio = parseFloat(match[1]);
      return ratio > 1 ? ratio / 100 : ratio;
    }
    return 0;
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
}
