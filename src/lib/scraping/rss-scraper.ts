/**
 * RSS/Atom feed scraper for passive signal ingestion.
 * Uses feedsmith for universal feed parsing (RSS 2.0, Atom, RDF, JSON Feed).
 * Falls back to fetching full articles when feeds only provide summaries.
 */

import { parseFeed } from "feedsmith";
import * as cheerio from "cheerio";
import { BaseScraper } from "./base-scraper";
import { logger } from "@/lib/logger";
import { scrapeWithFallback } from "./adaptive-scraper";
import { BlogScraper } from "./blog-scraper";

export interface FeedItem {
  title: string;
  link: string;
  description: string;
  content: string;
  pubDate: Date | null;
  guid?: string;
  author?: string;
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
    super(1.0, 30000, 3, 3600); // 1 hour cache TTL
  }

  override get scraperName(): string {
    return "rss-scraper";
  }

  /**
   * Fetch and parse an RSS/Atom feed from a URL.
   * Optionally fetches full articles for items that only have summaries.
   */
  async scrapeFeed(
    feedUrl: string,
    options?: { fetchFullArticles?: boolean }
  ): Promise<FeedMetadata | null> {
    logger.info("Scraping RSS feed", { feedUrl });

    const xml = await this.fetch(feedUrl);
    if (!xml) {
      logger.error("Failed to fetch RSS feed", { feedUrl });
      return null;
    }

    try {
      const metadata = this.parseFeed(xml, feedUrl);

      // If requested, fetch full articles for items with short content
      if (options?.fetchFullArticles) {
        await this.enrichWithFullArticles(metadata);
      }

      return metadata;
    } catch (error) {
      logger.error("Failed to parse RSS feed", {
        feedUrl,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Fetch full article content for feed items that only have summaries.
   * Uses adaptive scraping chain (fast HTTP → Jina Reader → stealth browser)
   * when basic extraction fails or returns insufficient content.
   * Updates items in-place with full content when available.
   */
  private async enrichWithFullArticles(metadata: FeedMetadata): Promise<void> {
    const CONTENT_THRESHOLD = 500; // chars - if content is shorter, fetch full article
    const MAX_FULL_ARTICLES = 10; // Cap to prevent overwhelming target server

    const itemsToFetch = metadata.items
      .filter(
        (item) => item.content.length < CONTENT_THRESHOLD && item.link
      )
      .slice(0, MAX_FULL_ARTICLES);

    if (itemsToFetch.length === 0) {
      logger.debug("All feed items have sufficient content", {
        feedUrl: metadata.link,
        itemCount: metadata.items.length,
      });
      return;
    }

    logger.info("Fetching full articles for items with short content", {
      feedUrl: metadata.link,
      itemsToFetch: itemsToFetch.length,
      totalItems: metadata.items.length,
      capped: itemsToFetch.length >= MAX_FULL_ARTICLES,
    });

    // Fetch articles sequentially to respect rate limiting
    for (const item of itemsToFetch) {
      try {
        // First try basic HTTP + cheerio extraction
        const html = await this.fetch(item.link);
        if (html) {
          const $ = cheerio.load(html);
          const fullContent = this.extractArticleContent($);

          if (fullContent && fullContent.length > item.content.length) {
            item.content = fullContent;
            logger.debug("Enriched item with full article content (basic)", {
              url: item.link,
              originalLength: item.content.length,
              newLength: fullContent.length,
            });
            continue; // Skip adaptive scraping if basic extraction succeeded
          }
        }

        // If basic extraction failed or returned insufficient content,
        // fall back to adaptive scraper chain (Jina Reader → stealth browser)
        logger.debug("Basic extraction insufficient, trying adaptive scraper", {
          url: item.link,
          currentLength: item.content.length,
        });

        const blogScraper = new BlogScraper();
        const result = await scrapeWithFallback(
          item.link,
          (url) => blogScraper.scrapeArticle(url)
        );

        if (result.article && result.article.bodyText) {
          const fullContent = result.article.bodyText;
          if (fullContent.length > item.content.length) {
            item.content = fullContent;
            logger.debug("Enriched item with full article content (adaptive)", {
              url: item.link,
              method: result.method,
              originalLength: item.content.length,
              newLength: fullContent.length,
            });
          }
        } else {
          logger.warn("Adaptive scraper failed to extract content", {
            url: item.link,
            method: result.method,
            reason: result.reason,
          });
        }
      } catch (error) {
        logger.warn("Failed to fetch full article", {
          url: item.link,
          error: String(error),
        });
      }
    }
  }

  /**
   * Extract article content from HTML page.
   * Uses common article selectors and falls back to largest text block.
   * Returns clean plain text with paragraph breaks.
   */
  private extractArticleContent($: cheerio.CheerioAPI): string {
    // Try common article content selectors
    const selectors = [
      '[itemprop="articleBody"]',
      ".entry-content",
      ".post-content",
      ".article-content",
      ".article-body",
      ".story-body",
      "article",
      "main",
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        // Clone to avoid mutating the original
        const clone = element.clone();
        // Remove non-content elements
        clone.find("script, style, nav, footer, header, aside, iframe, .sidebar, .ads, .ad-unit, .comments, .share, .social-share, .related-posts").remove();
        
        // Extract text with paragraph breaks
        const paragraphs: string[] = [];
        clone.find("p, h1, h2, h3, h4, h5, h6, li, blockquote").each((_, el) => {
          const text = $(el).text().trim();
          if (text.length > 0) {
            paragraphs.push(text);
          }
        });
        
        const text = paragraphs.join("\n\n");
        if (text.length > 200) {
          return this.cleanText(text);
        }
      }
    }

    // Fallback: find largest text block as plain text
    let maxLength = 0;
    let bestText = "";

    $("p, div").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > maxLength && text.length > 200) {
        maxLength = text.length;
        bestText = text;
      }
    });

    return this.cleanText(bestText);
  }

  /**
   * Clean text content: normalize whitespace, decode entities, remove excess newlines.
   */
  private cleanText(text: string): string {
    return text
      // Decode common HTML entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      // Normalize whitespace (multiple spaces to single space)
      .replace(/[ \t]+/g, " ")
      // Normalize newlines (3+ newlines to 2)
      .replace(/\n{3,}/g, "\n\n")
      // Trim each line
      .split("\n")
      .map(line => line.trim())
      .join("\n")
      // Final trim
      .trim();
  }

  /**
   * Convert HTML content to clean plain text.
   * Used for RSS feed content fields which often contain raw HTML.
   */
  private cleanHtmlToText(html: string): string {
    if (!html || !html.includes("<")) {
      // Not HTML, just clean the text directly
      return this.cleanText(html);
    }

    const $ = cheerio.load(html);

    // Remove non-content elements
    $("script, style, nav, header, footer, aside, iframe, .ads, .sidebar, .comments, .ad-unit, .share, .social-share").remove();

    // Extract text with paragraph breaks
    const paragraphs: string[] = [];
    $("p, h1, h2, h3, h4, h5, h6, li, blockquote").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 0) {
        paragraphs.push(text);
      }
    });

    // If we found structured content, join it
    if (paragraphs.length > 0) {
      return this.cleanText(paragraphs.join("\n\n"));
    }

    // Fallback: get all text and clean it
    const text = $.text();
    return this.cleanText(text);
  }

  /**
   * Parse feed XML/JSON using feedsmith and map to FeedMetadata.
   */
  private parseFeed(raw: string, feedUrl: string): FeedMetadata {
    const result = parseFeed(raw);

    switch (result.format) {
      case "rss":
        return this.mapRssFeed(result.feed, feedUrl);
      case "atom":
        return this.mapAtomFeed(result.feed, feedUrl);
      case "rdf":
        return this.mapRdfFeed(result.feed, feedUrl);
      case "json":
        return this.mapJsonFeed(result.feed, feedUrl);
    }
  }

  private mapRssFeed(
    feed: Record<string, unknown>,
    feedUrl: string
  ): FeedMetadata {
    const rss = feed as {
      title?: string;
      link?: string;
      description?: string;
      lastBuildDate?: string;
      pubDate?: string;
      items?: Array<Record<string, unknown>>;
    };

    const metadata: FeedMetadata = {
      title: rss.title || "Untitled Feed",
      link: rss.link || feedUrl,
      description: rss.description || "",
      lastBuildDate: this.validateDate(rss.lastBuildDate || rss.pubDate || ""),
      items: [],
    };

    for (const item of rss.items ?? []) {
      const rssItem = item as {
        title?: string;
        link?: string;
        description?: string;
        pubDate?: string;
        guid?: { value?: string };
        authors?: string[];
        content?: { encoded?: string };
        dc?: { creators?: string[] };
      };

      // Validate required fields - skip items without title or link
      if (!rssItem.title && !rssItem.link) {
        logger.debug("Skipping RSS item with no title or link", { feedUrl });
        continue;
      }

      const description = this.cleanHtmlToText(rssItem.description || "");
      const content = this.cleanHtmlToText(rssItem.content?.encoded || rssItem.description || "");
      const author =
        rssItem.authors?.[0] || rssItem.dc?.creators?.[0] || undefined;

      const feedItem: FeedItem = {
        title: rssItem.title || "Untitled",
        link: rssItem.link || "",
        description,
        content,
        pubDate: this.validateDate(rssItem.pubDate || ""),
        guid: rssItem.guid?.value || undefined,
        author: author?.trim() || undefined,
      };

      if (feedItem.link) {
        metadata.items.push(feedItem);
      }
    }

    logger.info("Parsed RSS feed", {
      feedUrl,
      itemCount: metadata.items.length,
    });

    return metadata;
  }

  private mapAtomFeed(
    feed: Record<string, unknown>,
    feedUrl: string
  ): FeedMetadata {
    const atom = feed as {
      title?: string;
      links?: Array<{ href?: string; rel?: string }>;
      subtitle?: string;
      updated?: string;
      entries?: Array<Record<string, unknown>>;
    };

    const atomLink =
      atom.links?.find((l) => l.rel === "alternate")?.href ||
      atom.links?.[0]?.href ||
      feedUrl;

    const metadata: FeedMetadata = {
      title: atom.title || "Untitled Feed",
      link: atomLink,
      description: atom.subtitle || "",
      lastBuildDate: this.validateDate(atom.updated || ""),
      items: [],
    };

    for (const entry of atom.entries ?? []) {
      const atomEntry = entry as {
        title?: string;
        links?: Array<{ href?: string; rel?: string }>;
        summary?: string;
        content?: string;
        published?: string;
        updated?: string;
        id?: string;
        authors?: Array<{ name?: string }>;
      };

      const entryLink =
        atomEntry.links?.find((l) => l.rel === "alternate")?.href ||
        atomEntry.links?.[0]?.href ||
        "";

      // Validate required fields - skip entries without title or link
      if (!atomEntry.title && !entryLink) {
        logger.debug("Skipping Atom entry with no title or link", { feedUrl });
        continue;
      }

      const feedItem: FeedItem = {
        title: atomEntry.title || "Untitled",
        link: entryLink,
        description: this.cleanHtmlToText(atomEntry.summary || ""),
        content: this.cleanHtmlToText(atomEntry.content || atomEntry.summary || ""),
        pubDate: this.validateDate(
          atomEntry.published || atomEntry.updated || ""
        ),
        guid: atomEntry.id || undefined,
        author: atomEntry.authors?.[0]?.name?.trim() || undefined,
      };

      if (feedItem.link) {
        metadata.items.push(feedItem);
      }
    }

    logger.info("Parsed Atom feed", {
      feedUrl,
      itemCount: metadata.items.length,
    });

    return metadata;
  }

  private mapRdfFeed(
    feed: Record<string, unknown>,
    feedUrl: string
  ): FeedMetadata {
    const rdf = feed as {
      title?: string;
      link?: string;
      description?: string;
      items?: Array<Record<string, unknown>>;
    };

    const metadata: FeedMetadata = {
      title: rdf.title || "Untitled Feed",
      link: rdf.link || feedUrl,
      description: rdf.description || "",
      lastBuildDate: null,
      items: [],
    };

    for (const item of rdf.items ?? []) {
      const rdfItem = item as {
        title?: string;
        link?: string;
        description?: string;
        dc?: { dates?: string[]; creators?: string[] };
        content?: { encoded?: string };
      };

      const description = this.cleanHtmlToText(rdfItem.description || "");
      const content = this.cleanHtmlToText(rdfItem.content?.encoded || rdfItem.description || "");

      const feedItem: FeedItem = {
        title: rdfItem.title || "Untitled",
        link: rdfItem.link || "",
        description,
        content,
        pubDate: this.validateDate(rdfItem.dc?.dates?.[0] || ""),
        guid: rdfItem.link || undefined,
        author: rdfItem.dc?.creators?.[0]?.trim() || undefined,
      };

      if (feedItem.link) {
        metadata.items.push(feedItem);
      }
    }

    logger.info("Parsed RDF feed", {
      feedUrl,
      itemCount: metadata.items.length,
    });

    return metadata;
  }

  private mapJsonFeed(
    feed: Record<string, unknown>,
    feedUrl: string
  ): FeedMetadata {
    const json = feed as {
      title?: string;
      home_page_url?: string;
      description?: string;
      items?: Array<Record<string, unknown>>;
    };

    const metadata: FeedMetadata = {
      title: json.title || "Untitled Feed",
      link: json.home_page_url || feedUrl,
      description: json.description || "",
      lastBuildDate: null,
      items: [],
    };

    for (const item of json.items ?? []) {
      const jsonItem = item as {
        id?: string;
        url?: string;
        title?: string;
        content_html?: string;
        content_text?: string;
        summary?: string;
        date_published?: string;
        date_modified?: string;
        authors?: Array<{ name?: string }>;
      };

      // Validate required fields - skip items without title or url
      if (!jsonItem.title && !jsonItem.url) {
        logger.debug("Skipping JSON feed item with no title or url", { feedUrl });
        continue;
      }

      const content =
        jsonItem.content_html || jsonItem.content_text || jsonItem.summary || "";

      const feedItem: FeedItem = {
        title: jsonItem.title || "Untitled",
        link: jsonItem.url || "",
        description: this.cleanHtmlToText(jsonItem.summary || ""),
        content: this.cleanHtmlToText(content),
        pubDate: this.validateDate(
          jsonItem.date_published || jsonItem.date_modified || ""
        ),
        guid: jsonItem.id || undefined,
        author: jsonItem.authors?.[0]?.name?.trim() || undefined,
      };

      if (feedItem.link) {
        metadata.items.push(feedItem);
      }
    }

    logger.info("Parsed JSON feed", {
      feedUrl,
      itemCount: metadata.items.length,
    });

    return metadata;
  }

  /**
   * Parse and validate a date string.
   * Rejects future dates and dates before 2000.
   */
  private validateDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      logger.warn("Failed to parse date", { dateStr });
      return null;
    }

    const now = new Date();
    if (date > now) {
      logger.warn("Rejecting future date", {
        dateStr,
        now: now.toISOString(),
      });
      return null;
    }

    if (date < new Date(2000, 0, 1)) {
      logger.warn("Rejecting suspiciously old date", { dateStr });
      return null;
    }

    return date;
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
