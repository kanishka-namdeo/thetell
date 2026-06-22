/**
 * Social profile discovery from company websites and web search.
 */

import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";
import { BaseScraper } from "@/lib/scraping/base-scraper";
import { WebSearchScraper } from "@/lib/scraping/web-search-scraper";
import { getProvider } from "@/lib/ai/provider";
import { SocialProfileSchema, type DiscoveredSocial } from "./types";

const SOCIAL_PLATFORM_PATTERNS: Array<{
  pattern: RegExp;
  platform: string;
  extractHandle: (url: URL) => string | null;
}> = [
  {
    pattern: /(?:twitter\.com|x\.com)\/([^/]+)/i,
    platform: "TWITTER",
    extractHandle: (url) => {
      const match = url.pathname.match(/^\/([^/]+)/);
      return match?.[1] && !["home", "search", "explore"].includes(match[1].toLowerCase())
        ? match[1]
        : null;
    },
  },
  {
    pattern: /linkedin\.com\/company\/([^/]+)/i,
    platform: "LINKEDIN",
    extractHandle: (url) => {
      const match = url.pathname.match(/\/company\/([^/]+)/);
      return match?.[1] ?? null;
    },
  },
  {
    pattern: /youtube\.com\/(?:@|channel\/|c\/|user\/)([^/]+)/i,
    platform: "YOUTUBE",
    extractHandle: (url) => {
      const match = url.pathname.match(/(?:@|channel\/|c\/|user\/)([^/]+)/);
      return match?.[1] ?? null;
    },
  },
  {
    pattern: /github\.com\/([^/]+)/i,
    platform: "GITHUB",
    extractHandle: (url) => {
      const match = url.pathname.match(/^\/([^/]+)/);
      return match?.[1] && !["about", "pricing", "features", "topics"].includes(match[1].toLowerCase())
        ? match[1]
        : null;
    },
  },
];

class SocialProbeScraper extends BaseScraper {
  constructor() {
    super(1.0, 15000, 2, 3600, true);
  }

  override get scraperName(): string {
    return "enrichment-social-probe";
  }
}

const scraper = new SocialProbeScraper();

/**
 * Discover social media profiles for a company.
 * Probes the website homepage first, then falls back to web search.
 */
export async function discoverSocialProfiles(
  companyName: string,
  websiteUrl: string
): Promise<DiscoveredSocial[]> {
  logger.info("enrichment.social_discovery.start", { companyName, websiteUrl });

  const profiles: DiscoveredSocial[] = [];
  const seenHandles = new Set<string>();

  try {
    // 1. Website probe — parse homepage <a> tags
    const websiteProfiles = await probeWebsiteForSocials(websiteUrl);
    for (const profile of websiteProfiles) {
      const key = `${profile.platform}:${profile.handle}`.toLowerCase();
      if (!seenHandles.has(key)) {
        seenHandles.add(key);
        profiles.push(profile);
      }
    }

    // 2. Web search fallback if fewer than 2 profiles found
    if (profiles.length < 2) {
      const searchProfiles = await searchForSocials(companyName);
      for (const profile of searchProfiles) {
        const key = `${profile.platform}:${profile.handle}`.toLowerCase();
        if (!seenHandles.has(key)) {
          seenHandles.add(key);
          profiles.push(profile);
        }
      }
    }

    logger.info("enrichment.social_discovery.complete", {
      companyName,
      profilesFound: profiles.length,
    });
  } catch (error) {
    logger.error("enrichment.social_discovery.error", {
      companyName,
      error: String(error),
    });
  }

  return profiles;
}

async function probeWebsiteForSocials(
  websiteUrl: string
): Promise<DiscoveredSocial[]> {
  const profiles: DiscoveredSocial[] = [];

  try {
    const html = await scraper.fetch(websiteUrl);
    if (!html) return profiles;

    const $ = cheerio.load(html);

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;

      try {
        const absoluteUrl = new URL(href, websiteUrl).href;
        const urlObj = new URL(absoluteUrl);

        for (const { pattern, platform, extractHandle } of SOCIAL_PLATFORM_PATTERNS) {
          if (pattern.test(absoluteUrl)) {
            const handle = extractHandle(urlObj);
            if (handle) {
              profiles.push({
                url: absoluteUrl,
                platform,
                handle,
                source: "website-link",
              });
            }
            break;
          }
        }
      } catch {
        // Invalid URL, skip
      }
    });
  } catch (error) {
    logger.warn("enrichment.social_discovery.website_probe_failed", {
      websiteUrl,
      error: String(error),
    });
  }

  return profiles;
}

async function searchForSocials(
  companyName: string
): Promise<DiscoveredSocial[]> {
  try {
    const searchScraper = new WebSearchScraper();
    const results = await searchScraper.search(
      `"${companyName}" site:twitter.com OR site:x.com OR site:linkedin.com OR site:github.com`,
      { numResults: 10 }
    );

    if (results.length === 0) return [];

    // Use LLM to extract profile URLs from search results
    const resultText = results
      .map((r) => `${r.title}: ${r.url}`)
      .join("\n");

    const provider = getProvider("openai");
    const extracted = await provider.completeStructured(
      [
        {
          role: "system",
          content:
            "You are a research assistant. Extract social media profile URLs from the search results. Only include official company profiles.",
        },
        {
          role: "user",
          content: `Extract social media profiles for "${companyName}" from these search results:\n\n${resultText}\n\nReturn only confirmed official profiles.`,
        },
      ],
      SocialProfileSchema,
      { temperature: 0.2 }
    );

    return extracted.profiles.map((p) => {
      const platform = detectPlatform(p.url);
      return {
        url: p.url,
        platform: platform ?? p.platform,
        handle: p.handle,
        source: "web-search" as const,
      };
    });
  } catch (error) {
    logger.warn("enrichment.social_discovery.search_failed", {
      companyName,
      error: String(error),
    });
    return [];
  }
}

function detectPlatform(url: string): string | null {
  const lower = url.toLowerCase();
  if (lower.includes("twitter.com") || lower.includes("x.com")) return "TWITTER";
  if (lower.includes("linkedin.com")) return "LINKEDIN";
  if (lower.includes("youtube.com")) return "YOUTUBE";
  if (lower.includes("github.com")) return "GITHUB";
  return null;
}
