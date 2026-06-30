/**
 * RSS/Atom feed discovery from company websites.
 * Probes homepage for feed links, checks common feed paths, and follows blog/news links.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper, RateLimiter } from "@/lib/scraping/base-scraper";
import type { DiscoveredFeed } from "./types";

const COMMON_FEED_PATHS = [
  "/feed",
  "/rss",
  "/blog/feed",
  "/news/feed",
  "/rss.xml",
  "/atom.xml",
  "/feed.xml",
];

const FEED_CONTENT_MARKERS = ["<rss", "<feed", "<channel>", '<?xml'];

const BLOG_NEWS_KEYWORDS = ["blog", "news", "press", "insights", "articles"];

class ProbeScraper extends BaseScraper {
  constructor() {
    super(1.0, 15000, 2, 3600, true);
  }

  override get scraperName(): string {
    return "enrichment-probe";
  }
}

const scraper = new ProbeScraper();
const rateLimiter = new RateLimiter(1.0);

/**
 * Probe a company website for RSS/Atom feeds.
 */
export async function probeWebsite(websiteUrl: string): Promise<DiscoveredFeed[]> {
  const feeds: DiscoveredFeed[] = [];
  const seenUrls = new Set<string>();

  logger.info("enrichment.website_probe.start", { websiteUrl });

  try {
    const html = await scraper.fetch(websiteUrl);
    if (!html) {
      logger.warn("enrichment.website_probe.fetch_failed", { websiteUrl });
      return feeds;
    }

    const $ = cheerio.load(html);
    const baseUrl = new URL(websiteUrl).origin;

    // 1. Find <link rel="alternate"> RSS/Atom tags
    $('link[rel="alternate"]').each((_, el) => {
      const type = $(el).attr("type") ?? "";
      const href = $(el).attr("href");
      if (!href) return;

      if (
        type.includes("rss+xml") ||
        type.includes("atom+xml") ||
        type.includes("feed+xml")
      ) {
        const absoluteUrl = resolveUrl(href, websiteUrl);
        if (!seenUrls.has(absoluteUrl)) {
          seenUrls.add(absoluteUrl);
          const label = $(el).attr("title") || extractLabelFromUrl(absoluteUrl);
          feeds.push({
            url: absoluteUrl,
            label,
            sourceType: type.includes("atom") ? "ATOM" : "RSS",
            confidence: 0.95,
            discoveryMethod: "website-probe",
          });
        }
      }
    });

    // 2. Probe common feed paths
    for (const path of COMMON_FEED_PATHS) {
      await rateLimiter.wait();
      const candidateUrl = `${baseUrl}${path}`;
      if (seenUrls.has(candidateUrl)) continue;

      try {
        const content = await scraper.fetch(candidateUrl);
        if (content && isFeedContent(content)) {
          seenUrls.add(candidateUrl);
          feeds.push({
            url: candidateUrl,
            label: extractLabelFromUrl(candidateUrl),
            sourceType: "RSS",
            confidence: 0.85,
            discoveryMethod: "website-probe",
          });
        }
      } catch {
        // Path doesn't exist, continue
      }
    }

    // 3. Parse <a> tags for blog/news/press links and check for RSS
    const candidatePages = extractCandidatePages($, websiteUrl);
    for (const pageUrl of candidatePages.slice(0, 5)) {
      await rateLimiter.wait();
      if (seenUrls.has(pageUrl)) continue;

      try {
        const pageHtml = await scraper.fetch(pageUrl);
        if (!pageHtml) continue;

        const page$ = cheerio.load(pageHtml);
        const pageFeeds = extractFeedLinksFromPage(page$, pageUrl);

        for (const feed of pageFeeds) {
          if (!seenUrls.has(feed.url)) {
            seenUrls.add(feed.url);
            feeds.push(feed);
          }
        }
      } catch {
        // Page fetch failed, continue
      }
    }

    logger.info("enrichment.website_probe.complete", {
      websiteUrl,
      feedsFound: feeds.length,
    });
  } catch (error) {
    logger.error("enrichment.website_probe.error", {
      websiteUrl,
      error: String(error),
    });
  }

  return feeds;
}

function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

function isFeedContent(content: string): boolean {
  const lower = content.slice(0, 500).toLowerCase();
  return FEED_CONTENT_MARKERS.some((marker) => lower.includes(marker));
}

function extractLabelFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      return segments[segments.length - 1].replace(/\.(xml|atom|rss)$/i, "");
    }
  } catch {
    // ignore
  }
  return "RSS Feed";
}

function extractCandidatePages($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    const text = ($(el).text() ?? "").toLowerCase();

    if (!href) return;

    const hrefLower = href.toLowerCase();
    const isCandidate = BLOG_NEWS_KEYWORDS.some(
      (kw) => hrefLower.includes(kw) || text.includes(kw)
    );

    if (isCandidate) {
      const absoluteUrl = resolveUrl(href, baseUrl);
      if (!seen.has(absoluteUrl) && absoluteUrl.startsWith("http")) {
        seen.add(absoluteUrl);
        candidates.push(absoluteUrl);
      }
    }
  });

  return candidates;
}

function extractFeedLinksFromPage(
  $: cheerio.CheerioAPI,
  pageUrl: string
): DiscoveredFeed[] {
  const feeds: DiscoveredFeed[] = [];

  $('link[rel="alternate"]').each((_, el) => {
    const type = $(el).attr("type") ?? "";
    const href = $(el).attr("href");
    if (!href) return;

    if (
      type.includes("rss+xml") ||
      type.includes("atom+xml") ||
      type.includes("feed+xml")
    ) {
      const absoluteUrl = resolveUrl(href, pageUrl);
      const label = $(el).attr("title") || extractLabelFromUrl(absoluteUrl);
      const isNews = pageUrl.toLowerCase().includes("news");
      feeds.push({
        url: absoluteUrl,
        label,
        sourceType: isNews ? "NEWS" : "RSS",
        confidence: 0.9,
        discoveryMethod: "website-probe",
      });
    }
  });

  return feeds;
}
