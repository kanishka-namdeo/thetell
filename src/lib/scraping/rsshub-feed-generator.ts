/**
 * RSSHub feed generator for dynamic, ticker-aware financial intelligence feeds.
 *
 * Generates RSSHub feed URLs based on company attributes (ticker, sector) to supplement
 * the static feed registry with financial data sources that don't have official RSS feeds.
 *
 * All feeds are routed through the self-hosted RSSHub instance (RSSHUB_URL).
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
  githubOrg?: string | null;
}

/**
 * Mapping of company slugs to their GitHub organization names.
 * Used to generate GitHub releases Atom feeds.
 */
const GITHUB_ORGS: Record<string, string> = {
  apple: "apple",
  microsoft: "microsoft",
  nvidia: "NVIDIA",
  amd: "AMD",
  tesla: "teslamotors",
  alphabet: "google",
  amazon: "aws",
  meta: "facebook",
  netflix: "Netflix",
  shopify: "Shopify",
  stripe: "stripe",
  cloudflare: "cloudflare",
  uber: "uber",
  airbnb: "airbnb",
  spotify: "spotify",
  salesforce: "salesforce",
  ibm: "ibm",
  intel: "intel",
  oracle: "oracle",
  adobe: "adobe",
  samsung: "Samsung",
  databricks: "databricks",
  hashicorp: "hashicorp",
  mongodb: "mongodb",
  palantir: "palantir",
  crowdstrike: "CrowdStrike",
  servicenow: "servicenow",
  snowflake: "snowflake",
  cisco: "cisco",
  paypal: "paypal",
  sony: "sony",
  sap: "SAP",
  qualcomm: "qualcomm",
  datadog: "DataDog",
  twilio: "twilio",
  openai: "openai",
  huggingface: "huggingface",
};

/**
 * Get the RSSHub base URL from environment.
 */
function getRsshubBaseUrl(): string {
  return process.env.RSSHUB_URL || "http://localhost:1200";
}

/**
 * Generate RSSHub feeds for a company based on its attributes.
 *
 * Routes created:
 * - Ticker-based: Finviz news, Seeking Alpha news/analysis/press-releases (only if company has ticker)
 * - Sector-based: Bloomberg technology/markets (only for relevant sectors)
 * - GitHub releases: official Atom feed for known GitHub orgs
 * - HN keyword feeds: official RSS via hnrss.org for company name and ticker
 * - Reddit keyword feeds: official Reddit search RSS for company name
 * - Global: Unusual Whales, 36kr newsflash, GitHub trending (deduped across companies)
 *
 * @param company - Company context with ticker, sector, slug, and githubOrg
 * @returns Array of RSSHub feed definitions
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

  // Bloomberg technology (for tech sector companies)
  if (sector && isTechSector(sector)) {
    feeds.push({
      url: `${baseUrl}/bloomberg/technology`,
      label: "Bloomberg Technology",
      sourceType: "NEWS",
    });
  }

  // Bloomberg markets (for financial sector companies)
  if (sector && isFinancialSector(sector)) {
    feeds.push({
      url: `${baseUrl}/bloomberg/markets`,
      label: "Bloomberg Markets",
      sourceType: "NEWS",
    });
  }

  // GitHub releases (official Atom feed, not RSSHub)
  const githubOrg = company.githubOrg || resolveGithubOrg(company.slug);
  if (githubOrg) {
    feeds.push({
      url: `https://github.com/${githubOrg}/releases.atom`,
      label: `GitHub Releases (${githubOrg})`,
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
  ];
}

/**
 * Resolve GitHub org name from a company slug.
 */
function resolveGithubOrg(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return GITHUB_ORGS[slug.toLowerCase()] ?? null;
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
