/**
 * Social media scraper for public X/Twitter posts (via Nitter) and Reddit posts.
 * X/Twitter scraping is fragile — includes robust fallback to multiple Nitter instances and RSS.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper } from "./base-scraper";

export interface SocialPostData {
  url: string;
  platform: "twitter" | "reddit" | "hackernews" | "mastodon";
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

const NITTER_INSTANCES = [
  "https://nitter.privacydev.net",
  "https://nitter.poast.org",
  "https://nitter.net",
  "https://nitter.1d4.us",
];

const REDDIT_BASE = "https://www.reddit.com";
const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";
const MASTODON_INSTANCES = ["mastodon.social", "techhub.social"];
const NITTER_STATUS_URL = "https://status.d4.d3r1.net/api/v1/instances";

export class SocialScraper extends BaseScraper {
  private dynamicNitterInstances: string[] | null = null;

  constructor() {
    super(1.0, 30000, 3, 86400, true);
  }

  override get scraperName(): string {
    return "social-scraper";
  }

  /**
   * Scrape a social media post from a URL.
   * Supports X/Twitter (via Nitter), Reddit, Hacker News, and Mastodon.
   */
  async scrapePost(url: string): Promise<SocialPostData | null> {
    const parsed = new URL(url);

    if (this.isTwitterUrl(parsed)) {
      return this.scrapeTwitterPost(url);
    }

    if (this.isRedditUrl(parsed)) {
      return this.scrapeRedditPost(url);
    }

    if (this.isHackerNewsUrl(parsed)) {
      return this.scrapeHackerNewsPost(url);
    }

    if (this.isMastodonUrl(parsed)) {
      return this.scrapeMastodonPost(url);
    }

    logger.warn("Unsupported social platform", { url });
    return null;
  }

  private isTwitterUrl(url: URL): boolean {
    return (
      url.hostname === "twitter.com" ||
      url.hostname === "x.com" ||
      url.hostname === "mobile.twitter.com"
    );
  }

  private isRedditUrl(url: URL): boolean {
    return (
      url.hostname === "reddit.com" ||
      url.hostname === "www.reddit.com" ||
      url.hostname === "old.reddit.com"
    );
  }

  private isHackerNewsUrl(url: URL): boolean {
    return url.hostname === "news.ycombinator.com";
  }

  private isMastodonUrl(url: URL): boolean {
    return MASTODON_INSTANCES.some((instance) => url.hostname === instance);
  }

  /**
   * Get the list of Nitter instances to try, fetching dynamic instances
   * from a community-maintained status page and merging with the static list.
   */
  private async getNitterInstances(): Promise<string[]> {
    if (this.dynamicNitterInstances) {
      return this.dynamicNitterInstances;
    }

    try {
      const text = await this.fetch(NITTER_STATUS_URL);
      if (text) {
        const data = JSON.parse(text) as Array<{ url?: string; available?: boolean }>;
        const healthy = data
          .filter((inst) => inst.available && inst.url)
          .map((inst) => inst.url!.replace(/\/+$/, ""));

        if (healthy.length > 0) {
          this.dynamicNitterInstances = [...new Set([...healthy, ...NITTER_INSTANCES])];
          logger.info("Loaded dynamic Nitter instances", {
            count: this.dynamicNitterInstances.length,
          });
          return this.dynamicNitterInstances;
        }
      }
    } catch (error) {
      logger.debug("Failed to fetch dynamic Nitter instances", {
        error: String(error),
      });
    }

    this.dynamicNitterInstances = NITTER_INSTANCES;
    return NITTER_INSTANCES;
  }

  /**
   * Scrape a Twitter/X post with a multi-layered fallback chain:
   * 1. Nitter HTML (dynamic instances)
   * 2. Nitter RSS (dynamic instances)
   * 3. Twitter/X embed page (last resort, limited data)
   */
  private async scrapeTwitterPost(url: string): Promise<SocialPostData | null> {
    const tweetId = this.extractTweetId(url);
    const username = this.extractUsername(url);

    if (!tweetId) {
      logger.warn("Could not extract tweet ID from URL", { url });
      return null;
    }

    const instances = await this.getNitterInstances();

    // Layer 1: Try each Nitter instance for HTML
    for (const instance of instances) {
      try {
        const nitterUrl = `${instance}/${username}/status/${tweetId}`;
        const html = await this.fetch(nitterUrl);

        if (html === null) continue;

        const result = this.parseNitterHtml(html, url, username);
        if (result) {
          logger.info("Scraped tweet via Nitter HTML", {
            url,
            instance,
            author: result.author,
          });
          return {
            ...result,
            metadata: { ...result.metadata, source: "nitter-html" },
          };
        }
      } catch (error) {
        logger.debug("Nitter instance failed", {
          url,
          instance,
          error: String(error),
        });
        continue;
      }
    }

    // Layer 2: Try Nitter RSS feed
    const rssResult = await this.scrapeTwitterRss(url, username, tweetId, instances);
    if (rssResult) {
      logger.info("Scraped tweet via Nitter RSS", { url });
      return rssResult;
    }

    // Layer 3: Twitter/X embed page (last resort)
    const embedResult = await this.scrapeTwitterEmbed(url, username, tweetId);
    if (embedResult) {
      logger.info("Scraped tweet via Twitter embed", { url });
      return embedResult;
    }

    logger.error("All Twitter scraping methods failed", { url });
    return null;
  }

  /**
   * Fallback: scrape Twitter post via Nitter RSS feed.
   */
  private async scrapeTwitterRss(
    url: string,
    username: string,
    tweetId: string,
    instances: string[],
  ): Promise<SocialPostData | null> {
    for (const instance of instances) {
      try {
        const rssUrl = `${instance}/${username}/rss`;
        const xml = await this.fetch(rssUrl);
        if (xml === null) continue;

        const $ = cheerio.load(xml, { xmlMode: true });
        const matchingItem = $("item").toArray().find((el) => {
          const link = $(el).find("link").text();
          return link.includes(tweetId);
        });

        if (!matchingItem) continue;

        const title = $(matchingItem).find("title").text().trim();
        const description = $(matchingItem).find("description").text().trim();
        const pubDate = $(matchingItem).find("pubDate").text().trim();
        const creator = $(matchingItem).find("dc\\:creator, creator").text().trim();

        const engagement = this.extractRssEngagement(description);

        const bodyText = cheerio.load(description).text().trim() || title;

        if (!bodyText) continue;

        return {
          url,
          platform: "twitter",
          author: creator || `@${username}`,
          authorUrl: `https://x.com/${username}`,
          bodyText,
          publishedAt: pubDate ? new Date(pubDate) : null,
          engagement,
          metadata: { source: "nitter-rss", tweetId },
        };
      } catch (error) {
        logger.debug("Nitter RSS failed", { instance, error: String(error) });
        continue;
      }
    }

    return null;
  }

  /**
   * Last-resort fallback: scrape Twitter/X embed page.
   * Twitter's publish embed endpoint returns an oEmbed JSON response
   * with the tweet text and author metadata.
   */
  private async scrapeTwitterEmbed(
    url: string,
    username: string,
    tweetId: string,
  ): Promise<SocialPostData | null> {
    try {
      const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&dnt=true`;
      const text = await this.fetch(oembedUrl);
      if (text === null) return null;

      const data = JSON.parse(text) as {
        html?: string;
        author_name?: string;
        author_url?: string;
      };

      if (!data.html) return null;

      const $ = cheerio.load(data.html);
      const bodyText = $("p").text().trim();
      if (!bodyText) return null;

      const author = data.author_name || `@${username}`;
      const authorUrl = data.author_url || `https://x.com/${username}`;

      return {
        url,
        platform: "twitter",
        author,
        authorUrl,
        bodyText,
        publishedAt: null,
        engagement: { likes: null, retweets: null, replies: null },
        metadata: { source: "twitter-oembed", tweetId },
      };
    } catch (error) {
      logger.debug("Twitter oEmbed failed", { url, error: String(error) });
      return null;
    }
  }

  private parseNitterHtml(
    html: string,
    originalUrl: string,
    username: string,
  ): SocialPostData | null {
    const $ = cheerio.load(html);

    const tweetContent = $(".tweet-content, .main-tweet .tweet-content").first();
    if (!tweetContent.length) return null;

    const bodyText = tweetContent.text().trim();
    if (!bodyText) return null;

    // Author
    const authorEl = $(".main-tweet .fullname, .main-tweet .username").first();
    const author = authorEl.text().trim() || `@${username}`;

    // Date
    const timestamp = $(".main-tweet .tweet-date time").first();
    let publishedAt: Date | null = null;
    const datetime = timestamp.attr("datetime");
    if (datetime) {
      publishedAt = new Date(datetime);
    } else {
      const titleAttr = timestamp.attr("title");
      if (titleAttr) publishedAt = new Date(titleAttr);
    }

    // Engagement metrics
    const likesText = $(".tweet-stat .tweet-heart, .main-tweet .icon-heart").closest(".tweet-stat").find(".tweet-stat-value").first().text();
    const retweetsText = $(".main-tweet .icon-retweet").closest(".tweet-stat").find(".tweet-stat-value").first().text();
    const repliesText = $(".main-tweet .icon-reply").closest(".tweet-stat").find(".tweet-stat-value").first().text();

    const likes = likesText ? this.parseCount(likesText) : null;
    const retweets = retweetsText ? this.parseCount(retweetsText) : null;
    const replies = repliesText ? this.parseCount(repliesText) : null;

    // Tweet ID
    const tweetId = this.extractTweetId(originalUrl);

    return {
      url: originalUrl,
      platform: "twitter",
      author,
      authorUrl: `https://x.com/${username}`,
      bodyText,
      publishedAt,
      engagement: { likes, retweets, replies },
      metadata: {
        source: "nitter",
        ...(tweetId ? { tweetId } : {}),
      },
    };
  }

  /**
   * Scrape a Reddit post.
   */
  private async scrapeRedditPost(url: string): Promise<SocialPostData | null> {
    // Normalize to old.reddit.com for more reliable scraping
    const normalizedUrl = url.replace("www.reddit.com", "old.reddit.com");

    // Try JSON API first (more reliable)
    const jsonResult = await this.scrapeRedditJson(normalizedUrl);
    if (jsonResult) return jsonResult;

    // Fallback to HTML scraping
    const html = await this.fetch(normalizedUrl);
    if (html === null) return null;

    return this.parseRedditHtml(html, url);
  }

  /**
   * Try Reddit's JSON API by appending .json to the URL.
   */
  private async scrapeRedditJson(url: string): Promise<SocialPostData | null> {
    try {
      const jsonUrl = url.replace(/\/$/, "") + ".json";
      const text = await this.fetch(jsonUrl);
      if (text === null) return null;

      const data = JSON.parse(text);

      if (!Array.isArray(data) || !data[0]?.data?.children?.[0]) {
        return null;
      }

      const post = data[0].data.children[0].data;

    return {
      url: `https://www.reddit.com${post.permalink}`,
      platform: "reddit",
      author: post.author || "[deleted]",
      authorUrl: `https://www.reddit.com/user/${post.author}`,
      bodyText: post.selftext || post.title || "",
      publishedAt: post.created_utc ? new Date(post.created_utc * 1000) : null,
      engagement: {
        likes: post.ups || null,
        retweets: null,
        replies: post.num_comments || null,
      },
      metadata: {
        subreddit: post.subreddit || "",
        score: String(post.score || 0),
        upvoteRatio: String(post.upvote_ratio || 0),
        postId: post.id || "",
      },
    };
    } catch (error) {
      logger.debug("Reddit JSON API failed", { url, error: String(error) });
      return null;
    }
  }

  private parseRedditHtml(html: string, originalUrl: string): SocialPostData | null {
    const $ = cheerio.load(html);

    const post = $(".thing.link");
    if (!post.length) return null;

    const title = post.find("a.title").first().text().trim();
    const bodyText = post.find(".expando .md").first().text().trim() || title;

    if (!bodyText) return null;

    const author = post.attr("data-author") || post.find(".author").first().text().trim() || "[deleted]";
    const subreddit = post.attr("data-subreddit") || "";
    const score = parseInt(post.attr("data-score") || "0", 10);
    const comments = parseInt(post.find(".comments").first().text().replace(/\D/g, "") || "0", 10);
    const timestamp = post.find("time").first().attr("datetime");

    const postId = post.attr("data-fullname") || "";

    return {
      url: originalUrl,
      platform: "reddit",
      author,
      authorUrl: `https://www.reddit.com/user/${author}`,
      bodyText,
      publishedAt: timestamp ? new Date(timestamp) : null,
      engagement: {
        likes: score || null,
        retweets: null,
        replies: comments || null,
      },
      metadata: {
        subreddit,
        score: String(score),
        postId,
      },
    };
  }

  private extractTweetId(url: string): string | null {
    const match = url.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  private extractUsername(url: string): string {
    const match = url.match(/(?:twitter\.com|x\.com|mobile\.twitter\.com)\/([^/]+)/);
    return match ? match[1] : "";
  }

  private parseCount(text: string): number {
    if (!text) return 0;
    const cleaned = text.replace(/,/g, "").trim();
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Extract engagement metrics from Nitter RSS description HTML.
   * Nitter RSS may include engagement stats in the HTML content.
   * Returns null for unknown values to distinguish from zero engagement.
   */
  private extractRssEngagement(description: string): {
    likes: number | null;
    retweets: number | null;
    replies: number | null;
  } {
    const $ = cheerio.load(description);

    // Try to find engagement stats in various formats
    // Nitter sometimes includes stats in tweet-stats class
    const likesText = $(".tweet-stat .tweet-heart, .icon-heart")
      .closest(".tweet-stat")
      .find(".tweet-stat-value")
      .first()
      .text();
    const retweetsText = $(".icon-retweet")
      .closest(".tweet-stat")
      .find(".tweet-stat-value")
      .first()
      .text();
    const repliesText = $(".icon-reply")
      .closest(".tweet-stat")
      .find(".tweet-stat-value")
      .first()
      .text();

    const likes = likesText ? this.parseCount(likesText) : null;
    const retweets = retweetsText ? this.parseCount(retweetsText) : null;
    const replies = repliesText ? this.parseCount(repliesText) : null;

    return { likes, retweets, replies };
  }

  /**
   * Scrape a Hacker News story by ID.
   * Uses the official Firebase HN API (free, no auth required).
   */
  private async scrapeHackerNewsPost(url: string): Promise<SocialPostData | null> {
    const storyId = this.extractHackerNewsId(url);
    if (!storyId) {
      logger.warn("Could not extract HN story ID from URL", { url });
      return null;
    }

    try {
      const itemUrl = `${HN_API_BASE}/item/${storyId}.json`;
      const text = await this.fetch(itemUrl);
      if (text === null) return null;

      const item = JSON.parse(text) as {
        id?: number;
        title?: string;
        text?: string;
        url?: string;
        by?: string;
        time?: number;
        score?: number;
        descendants?: number;
        type?: string;
        deleted?: boolean;
        dead?: boolean;
      };

      if (!item || item.deleted || item.dead) {
        logger.debug("HN item deleted or dead", { storyId });
        return null;
      }

      // Use title for link posts, text for text posts (Ask HN, etc.)
      const bodyText = item.title || item.text || "";
      if (!bodyText) return null;

      // Fetch top-level comments for additional context
      const comments = await this.fetchHackerNewsComments(storyId, 5);

      return {
        url: `https://news.ycombinator.com/item?id=${storyId}`,
        platform: "hackernews",
        author: item.by || "[anonymous]",
        authorUrl: item.by ? `https://news.ycombinator.com/user?id=${item.by}` : "",
        bodyText: comments.length > 0 ? `${bodyText}\n\n--- Top Comments ---\n${comments.join("\n")}` : bodyText,
        publishedAt: item.time ? new Date(item.time * 1000) : null,
        engagement: {
          likes: item.score || null,
          retweets: null,
          replies: item.descendants || null,
        },
        metadata: {
          source: "hackernews-api",
          storyId: String(storyId),
          ...(item.url ? { linkedUrl: item.url } : {}),
          ...(item.type ? { type: item.type } : {}),
        },
      };
    } catch (error) {
      logger.debug("Hacker News API failed", { url, error: String(error) });
      return null;
    }
  }

  /**
   * Fetch top-level comments from a Hacker News story for context.
   */
  private async fetchHackerNewsComments(storyId: string, maxComments: number): Promise<string[]> {
    try {
      const itemUrl = `${HN_API_BASE}/item/${storyId}.json`;
      const text = await this.fetch(itemUrl);
      if (text === null) return [];

      const item = JSON.parse(text) as { kids?: number[] };
      if (!item.kids || item.kids.length === 0) return [];

      // Fetch comments sequentially to avoid unbounded concurrency
      const comments: string[] = [];
      for (const kidId of item.kids.slice(0, maxComments)) {
        try {
          const commentUrl = `${HN_API_BASE}/item/${kidId}.json`;
          const commentText = await this.fetch(commentUrl);
          if (commentText === null) continue;

          const comment = JSON.parse(commentText) as {
            by?: string;
            text?: string;
            deleted?: boolean;
          };

          if (!comment || comment.deleted || !comment.text || !comment.by) continue;

          // Strip HTML tags from comment text
          const plainText = cheerio.load(comment.text).text().trim();
          comments.push(`${comment.by}: ${plainText.slice(0, 500)}`);
        } catch {
          continue;
        }
      }

      return comments;
    } catch (error) {
      logger.debug("Failed to fetch HN comments", { storyId, error: String(error) });
      return [];
    }
  }

  /**
   * Search Hacker News for stories mentioning a company.
   * Uses the Algolia HN search API (free, no auth required).
   */
  async searchHackerNews(query: string, limit: number = 10): Promise<Array<{
    storyId: string;
    title: string;
    url: string;
    author: string;
    score: number;
    publishedAt: Date | null;
  }>> {
    try {
      const searchUrl = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit}`;
      const text = await this.fetch(searchUrl);
      if (text === null) return [];

      const data = JSON.parse(text) as {
        hits?: Array<{
          objectID?: string;
          title?: string;
          url?: string;
          author?: string;
          points?: number;
          created_at_i?: number;
        }>;
      };

      if (!data.hits) return [];

      return data.hits
        .filter((hit) => hit.objectID && hit.title)
        .map((hit) => ({
          storyId: hit.objectID!,
          title: hit.title!,
          url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          author: hit.author || "[anonymous]",
          score: hit.points || 0,
          publishedAt: hit.created_at_i ? new Date(hit.created_at_i * 1000) : null,
        }));
    } catch (error) {
      logger.debug("HN search failed", { query, error: String(error) });
      return [];
    }
  }

  /**
   * Scrape a Mastodon post from a public instance.
   * Uses the Mastodon public API (no auth required for public posts).
   */
  private async scrapeMastodonPost(url: string): Promise<SocialPostData | null> {
    const { instance, statusId } = this.extractMastodonInfo(url);
    if (!instance || !statusId) {
      logger.warn("Could not extract Mastodon instance/status from URL", { url });
      return null;
    }

    try {
      const apiUrl = `https://${instance}/api/v1/statuses/${statusId}`;
      const text = await this.fetch(apiUrl);
      if (text === null) return null;

      const status = JSON.parse(text) as {
        id?: string;
        content?: string;
        url?: string;
        account?: {
          username?: string;
          acct?: string;
          url?: string;
          display_name?: string;
        };
        created_at?: string;
        favourites_count?: number;
        reblogs_count?: number;
        replies_count?: number;
        visibility?: string;
      };

      if (!status || !status.content) return null;

      // Strip HTML tags from content
      const bodyText = cheerio.load(status.content).text().trim();
      if (!bodyText) return null;

      const account = status.account;
      const author = account?.display_name || account?.username || "[anonymous]";
      const authorAcct = account?.acct || "";

      return {
        url: status.url || url,
        platform: "mastodon",
        author,
        authorUrl: account?.url || `https://${instance}/@${authorAcct.split("@")[0]}`,
        bodyText,
        publishedAt: status.created_at ? new Date(status.created_at) : null,
        engagement: {
          likes: status.favourites_count ?? null,
          retweets: status.reblogs_count ?? null,
          replies: status.replies_count ?? null,
        },
        metadata: {
          source: "mastodon-api",
          instance,
          statusId: status.id || statusId,
          visibility: status.visibility || "public",
          authorAcct,
        },
      };
    } catch (error) {
      logger.debug("Mastodon API failed", { url, error: String(error) });
      return null;
    }
  }

  /**
   * Search Mastodon for posts mentioning a company.
   * Searches across multiple public instances.
   */
  async searchMastodon(query: string, limit: number = 20): Promise<Array<{
    statusId: string;
    instance: string;
    url: string;
    author: string;
    authorAcct: string;
    content: string;
    publishedAt: Date | null;
    favouritesCount: number;
    reblogsCount: number;
  }>> {
    const results: Array<{
      statusId: string;
      instance: string;
      url: string;
      author: string;
      authorAcct: string;
      content: string;
      publishedAt: Date | null;
      favouritesCount: number;
      reblogsCount: number;
    }> = [];

    // Search across multiple instances
    for (const instance of MASTODON_INSTANCES) {
      if (results.length >= limit) break;

      try {
        const searchUrl = `https://${instance}/api/v2/search?q=${encodeURIComponent(query)}&type=statuses&limit=${Math.min(limit - results.length, 20)}`;
        const text = await this.fetch(searchUrl);
        if (text === null) continue;

        const data = JSON.parse(text) as {
          statuses?: Array<{
            id?: string;
            url?: string;
            content?: string;
            created_at?: string;
            account?: {
              username?: string;
              acct?: string;
              display_name?: string;
            };
            favourites_count?: number;
            reblogs_count?: number;
          }>;
        };

        if (!data.statuses) continue;

        for (const status of data.statuses) {
          if (!status.id || !status.content || !status.url) continue;

          const plainContent = cheerio.load(status.content).text().trim();
          if (!plainContent) continue;

          results.push({
            statusId: status.id,
            instance,
            url: status.url,
            author: status.account?.display_name || status.account?.username || "[anonymous]",
            authorAcct: status.account?.acct || "",
            content: plainContent,
            publishedAt: status.created_at ? new Date(status.created_at) : null,
            favouritesCount: status.favourites_count || 0,
            reblogsCount: status.reblogs_count || 0,
          });
        }
      } catch (error) {
        logger.debug("Mastodon search failed for instance", { instance, query, error: String(error) });
        continue;
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Check health of a Nitter instance by attempting to fetch its homepage.
   * Returns true if the instance responds within timeout.
   */
  async checkNitterInstanceHealth(instanceUrl: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(instanceUrl, {
        method: "HEAD",
        headers: { "User-Agent": BaseScraper.USER_AGENT },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      // Consume body to release connection
      await response.body?.cancel();
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get healthy Nitter instances by filtering the dynamic list.
   * Checks health in parallel and returns only responsive instances.
   */
  async getHealthyNitterInstances(): Promise<string[]> {
    const instances = await this.getNitterInstances();

    // Check health in parallel
    const healthChecks = await Promise.all(
      instances.map(async (instance) => ({
        instance,
        healthy: await this.checkNitterInstanceHealth(instance),
      }))
    );

    const healthy = healthChecks
      .filter((check) => check.healthy)
      .map((check) => check.instance);

    logger.info("Nitter instance health check complete", {
      total: instances.length,
      healthy: healthy.length,
      healthyInstances: healthy,
    });

    return healthy.length > 0 ? healthy : instances; // Fallback to all if none healthy
  }

  private extractHackerNewsId(url: string): string | null {
    // Match https://news.ycombinator.com/item?id=12345
    const match = url.match(/[?&]id=(\d+)/);
    return match ? match[1] : null;
  }

  private extractMastodonInfo(url: string): { instance: string | null; statusId: string | null } {
    // Match https://mastodon.social/@user/123456 or https://mastodon.social/users/user/statuses/123456
    const parsed = new URL(url);
    const instance = parsed.hostname;

    // Format 1: /@user/123456
    const webFormat = url.match(/\/@[^/]+\/(\d+)/);
    if (webFormat) {
      return { instance, statusId: webFormat[1] };
    }

    // Format 2: /users/user/statuses/123456
    const apiFormat = url.match(/\/statuses\/(\d+)/);
    if (apiFormat) {
      return { instance, statusId: apiFormat[1] };
    }

    return { instance: null, statusId: null };
  }
}
