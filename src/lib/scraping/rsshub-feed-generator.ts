/**
 * RSSHub feed generator for dynamic, ticker-aware financial intelligence feeds.
 *
 * Generates feed URLs based on company attributes (ticker, sector) to supplement
 * the static feed registry. Uses a mix of:
 * - RSSHub routes (Finviz, Google Scholar, Unusual Whales, 36kr)
 * - Native RSS feeds (Bloomberg, arXiv, Guardian - where RSSHub routes are broken)
 * - Official RSS feeds (HN via hnrss.org, Reddit, GitHub)
 *
 * Note: Reuters, Guardian (via RSSHub), and arXiv (via RSSHub) routes were removed
 * because those upstream sources broke their APIs or the RSSHub routes became unreliable.
 * Bloomberg is also accessed via native RSS since RSSHub times out on it.
 */

import type { FeedConfig } from "./feed-registry";

/**
 * RSSHub feed definition with source type metadata.
 */
export interface RsshubFeedDef {
  url: string;
  label: string;
  sourceType: FeedConfig["sourceType"];
}

/**
 * Company attributes needed for RSSHub feed generation.
 */
export interface RsshubCompanyContext {
  name: string;
  ticker: string | null;
  sector?: string | null;
  slug?: string | null;
}


/**
 * Get the RSSHub base URL from environment.
 */
function getRsshubBaseUrl(): string {
  return process.env.RSSHUB_URL || "http://localhost:1200";
}

/**
 * Generate feeds for a company based on its attributes.
 *
 * Routes created:
 * - Ticker-based: Finviz news (via RSSHub, only if company has ticker)
 * - Sector-based: Bloomberg technology/markets (native RSS, only for relevant sectors)
 * - HN keyword feeds: official RSS via hnrss.org for company name and ticker
 * - Reddit keyword feeds: official Reddit search RSS for company name
 * - arXiv: native RSS feed for AI papers (cs.AI category)
 * - Google Scholar: keyword feeds via RSSHub for company name
 * - Global: Unusual Whales, 36kr, Guardian China (deduped across companies)
 *
 * @param company - Company context with ticker, sector, slug
 * @returns Array of feed definitions
 */
export function generateRsshubFeeds(company: RsshubCompanyContext): RsshubFeedDef[] {
  const feeds: RsshubFeedDef[] = [];
  const baseUrl = getRsshubBaseUrl();

  // Ticker-based feeds (only if company has a ticker)
  if (company.ticker) {
    const ticker = company.ticker.toUpperCase();

    // Finviz per-ticker news aggregation
    feeds.push({
      url: `${baseUrl}/finviz/news/${encodeURIComponent(ticker)}`,
      label: `Finviz News (${ticker})`,
      sourceType: "NEWS",
    });
  }

  // Sector-based feeds
  const sector = company.sector?.toLowerCase();

  // Bloomberg technology (for tech sector companies) - native RSS, not RSSHub
  if (sector && isTechSector(sector)) {
    feeds.push({
      url: `https://feeds.bloomberg.com/technology/news.rss`,
      label: "Bloomberg Technology",
      sourceType: "NEWS",
    });
  }

  // Bloomberg markets (for financial sector companies) - native RSS, not RSSHub
  if (sector && isFinancialSector(sector)) {
    feeds.push({
      url: `https://feeds.bloomberg.com/markets/news.rss`,
      label: "Bloomberg Markets",
      sourceType: "NEWS",
    });
  }

  // HN keyword feeds (official RSS via hnrss.org, not RSSHub)
  feeds.push({
    url: `https://hnrss.org/newest?q=${encodeURIComponent(company.name)}`,
    label: `HN: ${company.name}`,
    sourceType: "SOCIAL",
  });

  if (company.ticker) {
    feeds.push({
      url: `https://hnrss.org/newest?q=${encodeURIComponent(company.ticker.toUpperCase())}`,
      label: `HN: ${company.ticker.toUpperCase()}`,
      sourceType: "SOCIAL",
    });
  }

  // Reddit keyword feeds (official Reddit search RSS, not RSSHub)
  feeds.push({
    url: `https://www.reddit.com/search.rss?q=${encodeURIComponent(company.name)}&sort=new&t=week`,
    label: `Reddit: ${company.name}`,
    sourceType: "SOCIAL",
  });

  // arXiv keyword feeds (native RSS - RSSHub arXiv route is unreliable)
  // arXiv provides category-based RSS feeds, not keyword search
  // We'll use the cs.AI category as a general tech/AI feed
  feeds.push({
    url: `https://rss.arxiv.org/rss/cs.AI`,
    label: `arXiv: AI Papers`,
    sourceType: "NEWS",
  });

  // Google Scholar keyword feeds (RSSHub route works)
  feeds.push({
    url: `${baseUrl}/google/scholar/${encodeURIComponent(company.name)}`,
    label: `Google Scholar: ${company.name}`,
    sourceType: "NEWS",
  });

  // Reuters feeds removed - Reuters killed their API endpoint in 2025
  // The RSSHub /reuters/:category route now returns 404 errors

  // Global feeds (generated for all companies, deduped by content hash in signal-discovery)
  feeds.push(...generateGlobalRsshubFeeds());

  return feeds;
}

/**
 * Generate global RSSHub feeds that apply to all companies.
 *
 * These feeds are generated per-company for simplicity but deduped
 * via the `rsshubFeedsProcessed` Set in signal-discovery.ts.
 *
 * @returns Array of global RSSHub feed definitions
 */
export function generateGlobalRsshubFeeds(): RsshubFeedDef[] {
  const baseUrl = getRsshubBaseUrl();

  return [
    {
      url: `${baseUrl}/unusualwhales/news`,
      label: "Unusual Whales",
      sourceType: "NEWS",
    },
    {
      url: `${baseUrl}/36kr/newsflashes`,
      label: "36kr Newsflashes",
      sourceType: "NEWS",
    },
    // Guardian feeds removed - RSSHub route no longer exists
    // Use Guardian's native RSS feeds instead (see feed-registry.ts)
    {
      url: "https://www.theguardian.com/world/china/rss",
      label: "The Guardian China",
      sourceType: "NEWS",
    },
    // Reuters feeds removed - Reuters killed their API endpoint
    // Bloomberg feeds removed - Bloomberg blocks scraping attempts
  ];
}

/**
 * Check if sector is technology-related.
 */
function isTechSector(sector: string): boolean {
  const techKeywords = [
    "technology",
    "tech",
    "software",
    "hardware",
    "semiconductor",
    "internet",
    "communications",
    "information technology",
    "it",
  ];
  return techKeywords.some((keyword) => sector.includes(keyword));
}

/**
 * Check if sector is financial-related.
 */
function isFinancialSector(sector: string): boolean {
  const financialKeywords = [
    "financial",
    "finance",
    "banking",
    "bank",
    "investment",
    "insurance",
    "asset management",
    "capital markets",
    "brokerage",
  ];
  return financialKeywords.some((keyword) => sector.includes(keyword));
}

/**
 * Convert RSSHub feed definitions to FeedConfig format for compatibility with existing pipeline.
 *
 * @param feeds - Array of RSSHub feed definitions
 * @returns Array of FeedConfig objects with via: "rsshub" marker
 */
export function toFeedConfig(feeds: RsshubFeedDef[]): FeedConfig[] {
  return feeds.map((feed) => ({
    url: feed.url,
    label: feed.label,
    sourceType: feed.sourceType,
    via: "rsshub" as const,
  }));
}
