/**
 * Multi-provider web search scraper.
 * Primary: Brave Search API (free tier ~1,000 queries/mo)
 * Fallback: DuckDuckGo via duck-duck-scrape (free, no key, but fragile)
 */

import { logger } from "@/lib/logger";
import { RateLimiter } from "./base-scraper";
import { search as ddgSearch, searchNews as ddgSearchNews } from "duck-duck-scrape";

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  publishedAt: Date | null;
}

export interface SearchOptions {
  searchType?: "search" | "news";
  numResults?: number;
}

const BRAVE_BASE_URL = "https://api.search.brave.com/res/v1";
const DEFAULT_NUM_RESULTS = 10;

export class WebSearchScraper {
  private braveApiKey: string | null;
  private rateLimiter: RateLimiter;

  constructor() {
    this.braveApiKey = process.env.BRAVE_API_KEY ?? null;
    // Brave API allows 1 req/s on free tier; DDG needs slower to avoid blocks
    this.rateLimiter = new RateLimiter(1.0);
  }

  get isConfigured(): boolean {
    // Configured if Brave key exists OR DuckDuckGo is available (always is)
    return true;
  }

  get hasBraveKey(): boolean {
    return this.braveApiKey !== null;
  }

  /**
   * Search the web using Brave Search API (primary) or DuckDuckGo (fallback).
   */
  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const searchType = options?.searchType ?? "search";
    const numResults = options?.numResults ?? DEFAULT_NUM_RESULTS;

    logger.info("web_search.start", {
      query: query.slice(0, 80),
      searchType,
      numResults,
      provider: this.braveApiKey ? "brave" : "duckduckgo",
    });

    await this.rateLimiter.wait();

    // Try Brave Search API first if configured
    if (this.braveApiKey) {
      try {
        const results = await this.searchBrave(query, searchType, numResults);
        logger.info("web_search.brave_success", {
          query: query.slice(0, 80),
          resultCount: results.length,
        });
        return results;
      } catch (error) {
        logger.warn("web_search.brave_failed", {
          query: query.slice(0, 80),
          error: String(error),
          fallback: "duckduckgo",
        });
        // Fall through to DuckDuckGo
      }
    }

    // Fallback to DuckDuckGo
    try {
      const results = await this.searchDuckDuckGo(query, searchType, numResults);
      logger.info("web_search.ddg_success", {
        query: query.slice(0, 80),
        resultCount: results.length,
      });
      return results;
    } catch (error) {
      logger.error("web_search.all_providers_failed", {
        query: query.slice(0, 80),
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Brave Search API implementation.
   * Free tier: ~1,000 queries/month ($5 credit).
   */
  private async searchBrave(
    query: string,
    searchType: "search" | "news",
    numResults: number
  ): Promise<SearchResult[]> {
    if (!this.braveApiKey) {
      throw new Error("BRAVE_API_KEY not configured");
    }

    const endpoint = searchType === "news" ? "/news/search" : "/web/search";
    const url = `${BRAVE_BASE_URL}${endpoint}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": this.braveApiKey,
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Brave API returned HTTP ${response.status}: ${response.statusText} - ${body.slice(0, 200)}`
      );
    }

    const data = await response.json();
    return this.parseBraveResults(data, searchType, numResults);
  }

  private parseBraveResults(
    data: Record<string, unknown>,
    searchType: "search" | "news",
    numResults: number
  ): SearchResult[] {
    const results: SearchResult[] = [];

    if (searchType === "news") {
      const news = data.news as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(news)) {
        for (const item of news.slice(0, numResults)) {
          const url = item.url as string | undefined;
          if (!url) continue;
          results.push({
            url,
            title: (item.title as string) || "",
            snippet: (item.description as string) || "",
            publishedAt: this.parseDate(item.age as string | undefined),
          });
        }
      }
    } else {
      const web = data.web as { results?: Array<Record<string, unknown>> } | undefined;
      if (web?.results && Array.isArray(web.results)) {
        for (const item of web.results.slice(0, numResults)) {
          const url = item.url as string | undefined;
          if (!url) continue;
          results.push({
            url,
            title: (item.title as string) || "",
            snippet: (item.description as string) || "",
            publishedAt: null,
          });
        }
      }
    }

    return results;
  }

  /**
   * DuckDuckGo fallback implementation.
   * Free, no API key, but prone to rate limiting and IP blocks.
   */
  private async searchDuckDuckGo(
    query: string,
    searchType: "search" | "news",
    numResults: number
  ): Promise<SearchResult[]> {
    try {
      const results: SearchResult[] = [];

      if (searchType === "news") {
        const newsResults = await ddgSearchNews(query);
        for (const item of newsResults.results.slice(0, numResults)) {
          results.push({
            url: item.url,
            title: item.title || "",
            snippet: item.excerpt || "",
            publishedAt: this.parseDate(String(item.date)),
          });
        }
      } else {
        // Import SafeSearchType enum
        const { SafeSearchType } = await import("duck-duck-scrape");
        const webResults = await ddgSearch(query, {
          safeSearch: SafeSearchType.OFF,
        });
        for (const item of webResults.results.slice(0, numResults)) {
          results.push({
            url: item.url,
            title: item.title || "",
            snippet: item.description || "",
            publishedAt: null,
          });
        }
      }

      return results;
    } catch (error) {
      throw new Error(`DuckDuckGo search failed: ${String(error)}`);
    }
  }

  /**
   * Parse relative date strings like "2 days ago" into Date objects.
   */
  private parseDate(dateStr: string | undefined): Date | null {
    if (!dateStr) return null;

    // Try parsing as ISO date first
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }

    // Handle relative dates like "2 days ago", "1 hour ago"
    const relativeMatch = dateStr.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2].toLowerCase();
      const now = new Date();

      switch (unit) {
        case "second":
          now.setSeconds(now.getSeconds() - amount);
          break;
        case "minute":
          now.setMinutes(now.getMinutes() - amount);
          break;
        case "hour":
          now.setHours(now.getHours() - amount);
          break;
        case "day":
          now.setDate(now.getDate() - amount);
          break;
        case "week":
          now.setDate(now.getDate() - amount * 7);
          break;
        case "month":
          now.setMonth(now.getMonth() - amount);
          break;
        case "year":
          now.setFullYear(now.getFullYear() - amount);
          break;
      }

      return now;
    }

    logger.debug("Could not parse date", { dateStr });
    return null;
  }
}
