/**
 * Dedicated Twitter/X scraper with multi-layer fallback chain.
 *
 * Layer 1: X oEmbed API (official, no auth) — individual tweet text/author/date
 * Layer 2: fxtwitter API (free proxy, no auth) — full tweet data with engagement
 * Layer 3: vxtwitter API (free proxy, no auth) — alternative proxy with engagement
 * Layer 4: RSSHub (self-hosted Docker) — user timeline RSS feeds (needs credentials)
 * Layer 5: Twitter syndication API — last resort for basic tweet data
 *
 * No X/Twitter account or API key required for Layers 1-3.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";
import { stripHtmlTags } from "./html-utils";

export interface TwitterPostData {
  url: string;
  author: string;
  authorUrl: string;
  bodyText: string;
  publishedAt: Date | null;
  engagement: {
    likes: number | null;
    retweets: number | null;
    replies: number | null;
  };
  metadata: Record<string, string>;
}

export interface TwitterTimelineItem {
  url: string;
  tweetId: string;
  author: string;
  authorHandle: string;
  bodyText: string;
  publishedAt: Date | null;
}

const OEMBED_ENDPOINT = "https://publish.twitter.com/oembed";
const FXTWITTER_ENDPOINT = "https://api.fxtwitter.com";
const VXTWITTER_ENDPOINT = "https://api.vxtwitter.com";
const SYNDICATION_ENDPOINT = "https://cdn.syndication.twimg.com/tweet-result";

export class TwitterScraper extends BaseScraper {
  private rsshubUrl: string;

  constructor() {
    super(0.5, 30000, 2, 3600, true);
    this.rsshubUrl = process.env.RSSHUB_URL || "http://localhost:1200";
  }

  override get scraperName(): string {
    return "twitter-scraper";
  }

  /**
   * Scrape a single tweet by URL using the multi-layer fallback chain.
   */
  async scrapeTweet(url: string): Promise<TwitterPostData | null> {
    const tweetId = this.extractTweetId(url);
    const username = this.extractUsername(url);

    if (!tweetId) {
      logger.warn("Could not extract tweet ID from URL", { url });
      return null;
    }

    const canonicalUrl = `https://x.com/${username}/status/${tweetId}`;

    // Layer 1: X oEmbed API (official, no auth, CORS-enabled)
    const oembedResult = await this.scrapeViaOembed(canonicalUrl, username, tweetId);
    if (oembedResult) {
      return oembedResult;
    }

    // Layer 2: fxtwitter API (free proxy, no auth)
    const fxtwitterResult = await this.scrapeViaFxtwitter(canonicalUrl, username, tweetId);
    if (fxtwitterResult) {
      return fxtwitterResult;
    }

    // Layer 3: vxtwitter API (free proxy, no auth)
    const vxtwitterResult = await this.scrapeViaVxtwitter(canonicalUrl, username, tweetId);
    if (vxtwitterResult) {
      return vxtwitterResult;
    }

    // Layer 4: Twitter syndication API (last resort for individual tweets)
    const syndicationResult = await this.scrapeViaSyndication(canonicalUrl, username, tweetId);
    if (syndicationResult) {
      return syndicationResult;
    }

    logger.error("All Twitter scraping layers failed for tweet", { url });
    return null;
  }

  /**
   * Fetch a user's recent tweets via the self-hosted RSSHub instance.
   * Returns structured timeline items for signal ingestion.
   */
  async scrapeUserTimeline(username: string, limit: number = 50): Promise<TwitterTimelineItem[]> {
    const rsshubUrl = `${this.rsshubUrl}/twitter/user/${encodeURIComponent(username)}`;

    try {
      const xml = await this.fetchDirect(rsshubUrl);
      if (!xml) {
        logger.warn("RSSHub timeline fetch failed", { username });
        return [];
      }

      return this.parseRsshubTimeline(xml, username, limit);
    } catch (error) {
      logger.error("RSSHub timeline scrape failed", {
        username,
        error: String(error),
      });
      return [];
    }
  }

  /**
   * Fetch tweets matching a search query via RSSHub.
   */
  async scrapeSearchResults(query: string, limit: number = 50): Promise<TwitterTimelineItem[]> {
    const rsshubUrl = `${this.rsshubUrl}/twitter/keyword/${encodeURIComponent(query)}`;

    try {
      const xml = await this.fetchDirect(rsshubUrl);
      if (!xml) {
        logger.warn("RSSHub search fetch failed", { query });
        return [];
      }

      return this.parseRsshubTimeline(xml, "search", limit);
    } catch (error) {
      logger.error("RSSHub search scrape failed", {
        query,
        error: String(error),
      });
      return [];
    }
  }

  /**
   * Fetch a hashtag timeline via RSSHub.
   */
  async scrapeHashtag(hashtag: string, limit: number = 50): Promise<TwitterTimelineItem[]> {
    const cleanHashtag = hashtag.replace(/^#/, "");
    return this.scrapeSearchResults(`#${cleanHashtag}`, limit);
  }

  /**
   * Layer 1: X oEmbed API — official, no auth required.
   * Returns tweet text, author name, author URL, and canonical URL.
   * Does not include engagement metrics or exact timestamps.
   */
  private async scrapeViaOembed(
    canonicalUrl: string,
    username: string,
    tweetId: string,
  ): Promise<TwitterPostData | null> {
    try {
      const oembedUrl = `${OEMBED_ENDPOINT}?url=${encodeURIComponent(canonicalUrl)}&omit_script=1&dnt=1`;
      const text = await this.fetchDirect(oembedUrl);
      if (!text) return null;

      const data = JSON.parse(text) as {
        html?: string;
        author_name?: string;
        author_url?: string;
        provider_name?: string;
        url?: string;
      };

      if (!data.html) return null;

      const $ = cheerio.load(data.html);
      const bodyText = $("p").text().trim();
      if (!bodyText) return null;

      const author = data.author_name || `@${username}`;
      const authorUrl = data.author_url || `https://x.com/${username}`;

      return {
        url: data.url || canonicalUrl,
        author,
        authorUrl,
        bodyText,
        publishedAt: null,
        engagement: { likes: null, retweets: null, replies: null },
        metadata: { source: "twitter-oembed", tweetId },
      };
    } catch (error) {
      logger.debug("Twitter oEmbed layer failed", {
        tweetId,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Layer 2: fxtwitter API — free proxy with full tweet data.
   * Returns tweet text, author, engagement metrics, and media.
   * No authentication required.
   */
  private async scrapeViaFxtwitter(
    canonicalUrl: string,
    username: string,
    tweetId: string,
  ): Promise<TwitterPostData | null> {
    try {
      const apiUrl = `${FXTWITTER_ENDPOINT}/${username}/status/${tweetId}`;
      const text = await this.fetchDirect(apiUrl);
      if (!text) return null;

      const data = JSON.parse(text) as {
        tweet?: {
          text?: string;
          created_at?: string;
          author?: {
            name?: string;
            screen_name?: string;
            url?: string;
          };
          likes?: number;
          retweets?: number;
          replies?: number;
          url?: string;
        };
      };

      const tweet = data.tweet;
      if (!tweet?.text) return null;

      return {
        url: tweet.url || canonicalUrl,
        author: tweet.author?.name || `@${username}`,
        authorUrl: tweet.author?.url || `https://x.com/${username}`,
        bodyText: tweet.text,
        publishedAt: tweet.created_at ? new Date(tweet.created_at) : null,
        engagement: {
          likes: tweet.likes ?? null,
          retweets: tweet.retweets ?? null,
          replies: tweet.replies ?? null,
        },
        metadata: { source: "fxtwitter", tweetId },
      };
    } catch (error) {
      logger.debug("fxtwitter layer failed", {
        tweetId,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Layer 3: vxtwitter API — alternative free proxy with engagement metrics.
   * Returns tweet text, author, and engagement data.
   * No authentication required.
   */
  private async scrapeViaVxtwitter(
    canonicalUrl: string,
    username: string,
    tweetId: string,
  ): Promise<TwitterPostData | null> {
    try {
      const apiUrl = `${VXTWITTER_ENDPOINT}/${username}/status/${tweetId}`;
      const text = await this.fetchDirect(apiUrl);
      if (!text) return null;

      const data = JSON.parse(text) as {
        text?: string;
        user_name?: string;
        user_screen_name?: string;
        user_url?: string;
        date?: string;
        likes?: number;
        retweets?: number;
        replies?: number;
        url?: string;
      };

      if (!data.text) return null;

      return {
        url: data.url || canonicalUrl,
        author: data.user_name || `@${username}`,
        authorUrl: data.user_url || `https://x.com/${username}`,
        bodyText: data.text,
        publishedAt: data.date ? new Date(data.date) : null,
        engagement: {
          likes: data.likes ?? null,
          retweets: data.retweets ?? null,
          replies: data.replies ?? null,
        },
        metadata: { source: "vxtwitter", tweetId },
      };
    } catch (error) {
      logger.debug("vxtwitter layer failed", {
        tweetId,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Layer 5: Twitter syndication API — last resort.
   * Returns basic tweet data without authentication.
   * This endpoint is undocumented but has been stable since 2020.
   */
  private async scrapeViaSyndication(
    canonicalUrl: string,
    username: string,
    tweetId: string,
  ): Promise<TwitterPostData | null> {
    try {
      const syndUrl = `${SYNDICATION_ENDPOINT}?id=${tweetId}&token=0`;
      const text = await this.fetchDirect(syndUrl);
      if (!text) return null;

      const data = JSON.parse(text) as {
        text?: string;
        tweet?: {
          text?: string;
          created_at?: string;
          user?: {
            name?: string;
            screen_name?: string;
          };
          favorite_count?: number;
          retweet_count?: number;
          reply_count?: number;
        };
      };

      // Prefer nested tweet object; fall back to flat response shape
      const tweet = data.tweet;
      const bodyText = tweet?.text || data.text;
      if (!bodyText) return null;

      const author = tweet?.user?.name || `@${username}`;
      const handle = tweet?.user?.screen_name || username;

      return {
        url: canonicalUrl,
        author,
        authorUrl: `https://x.com/${handle}`,
        bodyText,
        publishedAt: tweet?.created_at ? new Date(tweet.created_at) : null,
        engagement: {
          likes: tweet?.favorite_count ?? null,
          retweets: tweet?.retweet_count ?? null,
          replies: tweet?.reply_count ?? null,
        },
        metadata: { source: "twitter-syndication", tweetId },
      };
    } catch (error) {
      logger.debug("Twitter syndication layer failed", {
        tweetId,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Parse RSSHub timeline XML into structured items.
   */
  private parseRsshubTimeline(
    xml: string,
    context: string,
    limit: number,
  ): TwitterTimelineItem[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const items: TwitterTimelineItem[] = [];

    $("item").each((_, el) => {
      if (items.length >= limit) return false;

      const item = $(el);
      const link = item.find("link").first().text().trim();
      const title = item.find("title").first().text().trim();
      const description = item.find("description").first().text().trim();
      const pubDate = item.find("pubDate").first().text().trim();
      const creator = item.find("dc\\:creator, creator").first().text().trim();

      if (!link) return;

      const tweetId = this.extractTweetId(link) || "";
      const bodyText = stripHtmlTags(description) || title;
      if (!bodyText) return;

      const handleMatch = link.match(/x\.com\/([^/]+)|twitter\.com\/([^/]+)/);
      const authorHandle = handleMatch?.[1] || handleMatch?.[2] || creator || context;

      items.push({
        url: link,
        tweetId,
        author: creator || `@${authorHandle}`,
        authorHandle,
        bodyText,
        publishedAt: pubDate ? new Date(pubDate) : null,
      });
    });

    logger.info("Parsed RSSHub timeline", {
      context,
      itemCount: items.length,
    });

    return items;
  }

  /**
   * Direct HTTP fetch without robots.txt check (for API endpoints).
   * Includes rate limiting, caching, and retry from BaseScraper.
   */
  private async fetchDirect(url: string): Promise<string | null> {
    const cached = await this.cache.get(url);
    if (cached !== null) {
      return cached;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      await this.rateLimiter.wait();

      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": BaseScraper.USER_AGENT,
            Accept: "application/json, application/xml, text/xml, */*",
          },
          signal: AbortSignal.timeout(this.timeout),
          redirect: "follow",
        });

        if (response.ok) {
          const text = await this.readBodyWithLimit(response);
          await this.cache.set(url, text);
          return text;
        }

        if (response.status === 429 || response.status === 503) {
          const retryAfter = response.headers.get("Retry-After");
          const waitTime = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.min(2 ** attempt * 1000, 60000);

          await response.body?.cancel();
          await new Promise((r) => setTimeout(r, waitTime));
          continue;
        }

        await response.body?.cancel();
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error) {
        lastError = error as Error;
        const waitTime = Math.min(2 ** attempt * 1000, 60000);
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, waitTime));
        }
      }
    }

    logger.debug("Direct fetch failed", {
      url,
      error: lastError?.message ?? "Unknown error",
    });
    return null;
  }

  private extractTweetId(url: string): string | null {
    const match = url.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  private extractUsername(url: string): string {
    const match = url.match(/(?:twitter\.com|x\.com|mobile\.twitter\.com)\/([^/]+)/);
    return match ? match[1] : "";
  }
}
