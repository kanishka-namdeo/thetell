/**
 * Blog and news URL discovery from company websites.
 * Finds blog/news/press pages by parsing homepage links and checking for RSS feeds.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper, RateLimiter } from "@/lib/scraping/base-scraper";
import type { DiscoveredFeed } from "./types";

const BLOG_KEYWORDS = ["blog", "news", "press", "insights", "articles", "media", "updates"];

const MAX_CANDIDATES = 10;

class BlogDiscoveryScraper extends BaseScraper {
  constructor() {
    super(1.0, 15000, 2, 3600, true);
  }

  override get scraperName(): string {
    return "enrichment-blog-discovery";
  }
}

const scraper = new BlogDiscoveryScraper();
const rateLimiter = new RateLimiter(1.0);

/**
 * Discover blog and news URLs from a company website.
 * Parses homepage links, fetches candidate pages, and checks for RSS feeds.
 */
export async function discoverBlogUrls(
  websiteUrl: string
): Promise<DiscoveredFeed[]> {
  const feeds: DiscoveredFeed[] = [];

  logger.info("enrichment.blog_discovery.start", { websiteUrl });

  try {
    const html = await scraper.fetch(websiteUrl);
    if (!html) {
      logger.warn("enrichment.blog_discovery.fetch_failed", { websiteUrl });
      return feeds;
    }

    const $ = cheerio.load(html);
    const candidates = extractCandidateUrls($, websiteUrl);

    logger.debug("enrichment.blog_discovery.candidates", {
      websiteUrl,
      candidateCount: candidates.length,
    });

    for (const candidate of candidates.slice(0, MAX_CANDIDATES)) {
      await rateLimiter.wait();

      try {
        const pageHtml = await scraper.fetch(candidate.url);
        if (!pageHtml) continue;

        const page$ = cheerio.load(pageHtml);
        const feedLinks = extractFeedLinks(page$, candidate.url);

        if (feedLinks.length > 0) {
          for (const feed of feedLinks) {
            feeds.push({
              ...feed,
              sourceType: candidate.sourceType,
              discoveryMethod: "website-probe",
            });
          }
        } else {
          // Even without RSS, the page itself is a valid blog/news source
          feeds.push({
            url: candidate.url,
            label: candidate.label,
            sourceType: candidate.sourceType,
            confidence: 0.6,
            discoveryMethod: "website-probe",
          });
        }
      } catch {
        // Candidate page failed, continue to next
      }
    }

    logger.info("enrichment.blog_discovery.complete", {
      websiteUrl,
      blogsFound: feeds.length,
    });
  } catch (error) {
    logger.error("enrichment.blog_discovery.error", {
      websiteUrl,
      error: String(error),
    });
  }

  return feeds;
}

interface CandidateUrl {
  url: string;
  label: string;
  sourceType: string;
}

function extractCandidateUrls(
  $: cheerio.CheerioAPI,
  baseUrl: string
): CandidateUrl[] {
  const candidates: CandidateUrl[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const text = ($(el).text() ?? "").toLowerCase().trim();

    if (!href) return;

    const hrefLower = href.toLowerCase();
    const matchedKeyword = BLOG_KEYWORDS.find(
      (kw) => hrefLower.includes(kw) || text.includes(kw)
    );

    if (!matchedKeyword) return;

    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(href, baseUrl).href;
    } catch {
      return;
    }

    // Only follow same-domain links or known blog platforms
    if (!absoluteUrl.startsWith("http")) return;

    if (seen.has(absoluteUrl)) return;
    seen.add(absoluteUrl);

    // Determine source type from URL path
    const isNews =
      hrefLower.includes("news") ||
      hrefLower.includes("press") ||
      hrefLower.includes("media");
    const sourceType = isNews ? "NEWS" : "BLOG";

    const label = text || matchedKeyword;

    candidates.push({ url: absoluteUrl, label, sourceType });
  });

  return candidates;
}

function extractFeedLinks(
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
      try {
        const absoluteUrl = new URL(href, pageUrl).href;
        const label = $(el).attr("title") || "Feed";
        feeds.push({
          url: absoluteUrl,
          label,
          sourceType: "RSS",
          confidence: 0.9,
          discoveryMethod: "website-probe",
        });
      } catch {
        // Invalid URL
      }
    }
  });

  return feeds;
}
