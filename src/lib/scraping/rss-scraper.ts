/**
 * RSS/Atom feed scraper for passive signal ingestion.
 * Parses RSS 2.0 and Atom feeds to extract articles/items.
 */

import * as cheerio from "cheerio";
import { BaseScraper } from "./base-scraper";
import { logger } from "@/lib/logger";

export interface FeedItem {
  title: string;
  link: string;
  description: string;
  content: string;
  pubDate: Date | null;
  guid?: string;
}

export interface FeedMetadata {
  title: string;
  link: string;
  description: string;
  lastBuildDate: Date | null;
  items: FeedItem[];
}

export class RssScraper extends BaseScraper {
  constructor() {
    // RSS feeds are typically static and can be cached longer
    super(1.0, 30000, 3, 3600); // 1 hour cache TTL
  }

  /**
   * Fetch and parse an RSS/Atom feed from a URL.
   */
  async scrapeFeed(feedUrl: string): Promise<FeedMetadata | null> {
    logger.info("Scraping RSS feed", { feedUrl });

    const xml = await this.fetch(feedUrl);
    if (!xml) {
      logger.error("Failed to fetch RSS feed", { feedUrl });
      return null;
    }

    try {
      return this.parseFeed(xml, feedUrl);
    } catch (error) {
      logger.error("Failed to parse RSS feed", {
        feedUrl,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Parse RSS/Atom XML and extract feed metadata and items.
   */
  private parseFeed(xml: string, feedUrl: string): FeedMetadata {
    const $ = cheerio.load(xml, { xmlMode: true });

    // Detect feed type and parse accordingly
    if ($("rss").length > 0) {
      return this.parseRss2($, feedUrl);
    } else if ($("feed").length > 0) {
      return this.parseAtom($, feedUrl);
    } else {
      throw new Error("Unknown feed format: not RSS or Atom");
    }
  }

  /**
   * Parse RSS 2.0 format.
   */
  private parseRss2(
    $: cheerio.CheerioAPI,
    feedUrl: string
  ): FeedMetadata {
    const channel = $("channel");

    const metadata: FeedMetadata = {
      title: channel.find("title").first().text() || "Untitled Feed",
      link: channel.find("link").first().text() || feedUrl,
      description: channel.find("description").first().text() || "",
      lastBuildDate: this.parseDate(
        channel.find("lastBuildDate").first().text() ||
          channel.find("pubDate").first().text()
      ),
      items: [],
    };

    $("item").each((_, element) => {
      const item = $(element);

      // Extract content: prefer content:encoded, fall back to description
      const contentEncoded = item.find("content\\:encoded").text();
      const description = item.find("description").text();
      const content = contentEncoded || description;

      const feedItem: FeedItem = {
        title: item.find("title").first().text() || "Untitled",
        link: item.find("link").first().text() || "",
        description: description,
        content: content,
        pubDate: this.parseDate(item.find("pubDate").first().text()),
        guid: item.find("guid").first().text() || undefined,
      };

      if (feedItem.link) {
        metadata.items.push(feedItem);
      }
    });

    logger.info("Parsed RSS 2.0 feed", {
      feedUrl,
      itemCount: metadata.items.length,
    });

    return metadata;
  }

  /**
   * Parse Atom format.
   */
  private parseAtom(
    $: cheerio.CheerioAPI,
    feedUrl: string
  ): FeedMetadata {
    const feed = $("feed");

    // Atom links can be in <link href="..."> format
    const getAtomLink = (selector: string): string => {
      const linkEl = feed.find(selector).first();
      return linkEl.attr("href") || linkEl.text() || "";
    };

    const metadata: FeedMetadata = {
      title: feed.find("title").first().text() || "Untitled Feed",
      link: getAtomLink('link[rel="alternate"]') || getAtomLink("link") || feedUrl,
      description: feed.find("subtitle").first().text() || "",
      lastBuildDate: this.parseDate(
        feed.find("updated").first().text()
      ),
      items: [],
    };

    feed.find("entry").each((_, element) => {
      const entry = $(element);

      // Atom entries can have multiple links; prefer alternate
      const entryLink =
        entry.find('link[rel="alternate"]').attr("href") ||
        entry.find("link").first().attr("href") ||
        "";

      // Atom content can be in <content> or <summary>
      const content = entry.find("content").first().text();
      const summary = entry.find("summary").first().text();

      const feedItem: FeedItem = {
        title: entry.find("title").first().text() || "Untitled",
        link: entryLink,
        description: summary,
        content: content || summary,
        pubDate: this.parseDate(
          entry.find("published").first().text() ||
            entry.find("updated").first().text()
        ),
        guid: entry.find("id").first().text() || undefined,
      };

      if (feedItem.link) {
        metadata.items.push(feedItem);
      }
    });

    logger.info("Parsed Atom feed", {
      feedUrl,
      itemCount: metadata.items.length,
    });

    return metadata;
  }

  /**
   * Parse a date string into a Date object.
   * Handles various date formats found in RSS/Atom feeds.
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
   * Scrape a single item from an RSS feed by its URL.
   * Useful when you have a specific article URL and want to find it in the feed.
   */
  async scrapeItemFromFeed(
    feedUrl: string,
    itemUrl: string
  ): Promise<FeedItem | null> {
    const feed = await this.scrapeFeed(feedUrl);
    if (!feed) return null;

    // Normalize URLs for comparison
    const normalizeUrl = (url: string) =>
      url.replace(/\/$/, "").toLowerCase();

    const normalizedTarget = normalizeUrl(itemUrl);

    return (
      feed.items.find(
        (item) => normalizeUrl(item.link) === normalizedTarget
      ) || null
    );
  }
}
