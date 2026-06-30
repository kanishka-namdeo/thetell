/**
 * Company enrichment orchestrator.
 * Coordinates discovery of feeds, social profiles, blogs, and ticker symbols.
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { probeWebsite } from "./website-probe";
import { lookupTicker } from "./ticker-lookup";
import { lookupWebsite } from "./website-lookup";
import { discoverSocialProfiles } from "./social-discovery";
import { discoverBlogUrls } from "./blog-discovery";
import type { EnrichmentResult, DiscoveredFeed, DiscoveredSocial, TickerLookupResult, WebsiteLookupResult } from "./types";
import type { SourceType } from "@prisma/client";

const VALID_SOURCE_TYPES = new Set<string>([
  "NEWS", "FILING", "TRANSCRIPT", "SOCIAL", "BLOG", "JOB_POSTING", "RSS",
  "PATENT", "LITIGATION", "FDA", "CONTRACT", "TECH_SIGNAL", "WEB_ARCHIVE",
  "LEGISLATION", "ACADEMIC", "PODCAST", "CONFERENCE", "PRESS_RELEASE", "LOBBYING",
]);

function toSourceType(value: string): SourceType {
  return (VALID_SOURCE_TYPES.has(value) ? value : "RSS") as SourceType;
}

/**
 * Enrich a company with discovered data sources, social profiles, ticker, and website.
 */
export async function enrichCompany(companyId: string): Promise<EnrichmentResult> {
  const startTime = Date.now();
  
  logger.info("enrichment.start", { companyId });

  try {
    // 1. Load company from DB
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new Error(`Company not found: ${companyId}`);
    }

    logger.info("enrichment.company_loaded", {
      companyId,
      name: company.name,
      hasWebsite: !!company.websiteUrl,
      hasTicker: !!company.ticker,
    });

    // 2. Run discovery in parallel with individual timeouts
    const withTimeout = <T>(promise: Promise<T>, ms: number, name: string): Promise<T> => {
      const timeoutPromise = new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${name} timeout after ${ms}ms`)), ms)
      );
      return Promise.race([promise, timeoutPromise]);
    };

    // First: lookup ticker and website (needed for website probing if missing)
    const [tickerResult, websiteResult] = await Promise.all([
      withTimeout(lookupTicker(company.name), 10000, "ticker"),
      !company.websiteUrl ? withTimeout(lookupWebsite(company.name, company.ticker), 10000, "website-lookup") : Promise.resolve(null),
    ]);

    // Determine website URL to use (existing or discovered)
    let websiteUrl = company.websiteUrl;
    let website: WebsiteLookupResult | null = null;

    if (!websiteUrl && websiteResult?.websiteUrl) {
      websiteUrl = websiteResult.websiteUrl;
      website = websiteResult;
      
      // Store discovered website URL
      try {
        await prisma.company.update({
          where: { id: companyId },
          data: { websiteUrl: websiteUrl },
        });
        logger.info("enrichment.website_stored", {
          companyId,
          websiteUrl,
          confidence: websiteResult.confidence,
        });
      } catch (error) {
        logger.warn("enrichment.website_store_failed", {
          companyId,
          error: String(error),
        });
      }
    }

    // Now: probe feeds, socials, blogs using the website URL
    const [feedsResult, socialsResult, blogsResult] = await Promise.all([
      websiteUrl ? withTimeout(probeWebsite(websiteUrl), 10000, "website") : Promise.resolve([] as DiscoveredFeed[]),
      websiteUrl ? withTimeout(discoverSocialProfiles(company.name, websiteUrl), 10000, "social") : Promise.resolve([] as DiscoveredSocial[]),
      websiteUrl ? withTimeout(discoverBlogUrls(websiteUrl), 10000, "blog") : Promise.resolve([] as DiscoveredFeed[]),
    ]);

    // 3. Extract results
    const ticker = tickerResult;
    const feeds = feedsResult;
    const socials = socialsResult;
    const blogs = blogsResult;

    // 4. Store feeds in DB
    const allFeeds = [...feeds, ...blogs];
    let feedsStored = 0;

    for (const feed of allFeeds) {
      try {
        const sourceType = toSourceType(feed.sourceType);
        await prisma.companyDataSource.upsert({
          where: {
            companyId_url: {
              companyId,
              url: feed.url,
            },
          },
          update: {
            label: feed.label,
            sourceType,
            discoveryMethod: feed.discoveryMethod,
            validatedAt: new Date(),
          },
          create: {
            companyId,
            url: feed.url,
            sourceType,
            label: feed.label,
            discoveryMethod: feed.discoveryMethod,
            isActive: true,
            validatedAt: new Date(),
          },
        });
        feedsStored++;
      } catch (error) {
        logger.warn("enrichment.feed_store_failed", {
          companyId,
          url: feed.url,
          error: String(error),
        });
      }
    }

    // 5. Store ticker if found (and wasn't already set)
    if (ticker?.ticker && !company.ticker) {
      try {
        await prisma.company.update({
          where: { id: companyId },
          data: { ticker: ticker.ticker },
        });
        logger.info("enrichment.ticker_stored", {
          companyId,
          ticker: ticker.ticker,
        });
      } catch (error) {
        logger.warn("enrichment.ticker_store_failed", {
          companyId,
          error: String(error),
        });
      }
    }

    // 6. Create enrichment log
    const durationMs = Date.now() - startTime;
    const status = determineStatus(feedsStored, ticker, website, socials.length, blogs.length);

    await prisma.companyEnrichmentLog.create({
      data: {
        companyId,
        status,
        feedsDiscovered: feeds.length,
        feedsValidated: feedsStored,
        tickerFound: ticker?.ticker ?? null,
        socialsDiscovered: socials.length,
        blogsDiscovered: blogs.length,
        durationMs,
      },
    });

    const result: EnrichmentResult = {
      companyId,
      feeds,
      socials,
      ticker,
      website,
      blogs,
      status,
    };

    logger.info("enrichment.complete", {
      companyId,
      status,
      feedsFound: feeds.length,
      feedsStored,
      socialsFound: socials.length,
      blogsFound: blogs.length,
      tickerFound: !!ticker?.ticker,
      websiteFound: !!website?.websiteUrl,
      durationMs,
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    
    logger.error("enrichment.failed", {
      companyId,
      error: String(error),
      durationMs,
    });

    // Log failure (only if we have a valid companyId)
    if (companyId) {
      try {
        await prisma.companyEnrichmentLog.create({
          data: {
            companyId,
            status: "failed",
            feedsDiscovered: 0,
            feedsValidated: 0,
            tickerFound: null,
            socialsDiscovered: 0,
            blogsDiscovered: 0,
            error: String(error),
            durationMs,
          },
        });
      } catch (logError) {
        logger.error("enrichment.log_failed", {
          companyId,
          error: String(logError),
        });
      }
    }

    return {
      companyId,
      feeds: [],
      socials: [],
      ticker: null,
      website: null,
      blogs: [],
      status: "failed",
      error: String(error),
    };
  }
}

function determineStatus(
  feedsStored: number,
  ticker: TickerLookupResult | null,
  website: WebsiteLookupResult | null,
  socialsCount: number,
  blogsCount: number
): "success" | "partial" | "failed" {
  const hasAnyData = feedsStored > 0 || ticker?.ticker || website?.websiteUrl || socialsCount > 0 || blogsCount > 0;
  
  if (!hasAnyData) {
    return "failed";
  }

  // Success if we have feeds and either ticker, website, or socials
  if (feedsStored > 0 && (ticker?.ticker || website?.websiteUrl || socialsCount > 0)) {
    return "success";
  }

  return "partial";
}
