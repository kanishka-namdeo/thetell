/**
 * Scheduled discovery function for automated signal ingestion.
 * Runs daily via Inngest cron to discover new signals from RSS feeds and SEC EDGAR.
 */

import { inngest } from "./client";
import { cron } from "inngest";
import { prisma } from "@/lib/db";
import { RssScraper } from "@/lib/scraping/rss-scraper";
import { FilingScraper } from "@/lib/scraping/filing-scraper";
import { GitHubScraper } from "@/lib/scraping/github-scraper";
import { CertTransparencyScraper } from "@/lib/scraping/cert-transparency-scraper";
import { RedditFinancialScraper } from "@/lib/scraping/reddit-financial-scraper";
import { PressReleaseScraper } from "@/lib/scraping/press-release-scraper";
import { UspScraper } from "@/lib/scraping/uspto-scraper";
import { CourtListenerScraper } from "@/lib/scraping/courtlistener-scraper";
import { FdaScraper } from "@/lib/scraping/fda-scraper";
import { SamScraper } from "@/lib/scraping/sam-scraper";
import { WaybackScraper } from "@/lib/scraping/wayback-scraper";
import { CongressScraper } from "@/lib/scraping/congress-scraper";
import { AcademicScraper } from "@/lib/scraping/academic-scraper";
import { getAllFeeds } from "@/lib/scraping/feed-registry";
import { normalizeUrl, computeContentHash } from "@/lib/scraping/url-normalizer";
import { logger } from "@/lib/logger";
import type { SourceType } from "@prisma/client";

/**
 * Daily discovery function that scans RSS feeds and SEC EDGAR for new signals.
 * Runs at 2:00 AM UTC to avoid peak hours.
 */
export const discoverSignalsFunction = inngest.createFunction(
  {
    id: "discover-signals",
    triggers: [cron("0 2 * * *")], // Daily at 2:00 AM UTC
    retries: 2,
  },
  async ({ step }) => {
    const log = logger.child({ function: "discover-signals" });
    log.info("discovery.start");

    const rssScraper = new RssScraper();
    const filingScraper = new FilingScraper();

    const results = {
      feedsProcessed: 0,
      filingsProcessed: 0,
      githubOrgsProcessed: 0,
      certDomainsProcessed: 0,
      redditProcessed: 0,
      pressReleasesProcessed: 0,
      usptoProcessed: 0,
      courtListenerProcessed: 0,
      fdaProcessed: 0,
      samProcessed: 0,
      waybackProcessed: 0,
      congressProcessed: 0,
      academicProcessed: 0,
      signalsCreated: 0,
      duplicatesSkipped: 0,
      errors: [] as string[],
    };

    // Step 1: Process RSS feeds
    await step.run("process-rss-feeds", async () => {
      const feeds = getAllFeeds();
      log.info("discovery.rss_feeds.start", { feedCount: feeds.length });

      for (const companyFeed of feeds) {
        for (const feed of companyFeed.feeds) {
          try {
            log.info("discovery.rss_feed.processing", {
              companyId: companyFeed.companyId,
              feedUrl: feed.url,
              label: feed.label,
            });

            const feedData = await rssScraper.scrapeFeed(feed.url);
            if (!feedData) {
              log.warn("discovery.rss_feed.failed", { feedUrl: feed.url });
              results.errors.push(`Failed to fetch feed: ${feed.url}`);
              continue;
            }

            results.feedsProcessed++;

            // Process each item in the feed
            for (const item of feedData.items.slice(0, 10)) {
              // Limit to 10 most recent items per feed
              try {
                await processFeedItem(
                  item,
                  companyFeed.companyId,
                  companyFeed.companyName,
                  feed.sourceType || "RSS",
                  results
                );
              } catch (error) {
                const errorMsg = `Failed to process feed item: ${item.link} - ${String(error)}`;
                log.error("discovery.feed_item.failed", {
                  itemUrl: item.link,
                  error: String(error),
                });
                results.errors.push(errorMsg);
              }
            }
          } catch (error) {
            const errorMsg = `Failed to process feed: ${feed.url} - ${String(error)}`;
            log.error("discovery.rss_feed.error", {
              feedUrl: feed.url,
              error: String(error),
            });
            results.errors.push(errorMsg);
          }
        }
      }

      return { feedsProcessed: results.feedsProcessed };
    });

    // Step 2: Process SEC EDGAR filings for tracked companies
    await step.run("process-sec-filings", async () => {
      // Get companies with tickers (public companies that likely have SEC filings)
      const companies = await prisma.company.findMany({
        where: {
          ticker: { not: null },
        },
        select: {
          id: true,
          name: true,
          ticker: true,
        },
      });

      log.info("discovery.sec_filings.start", { companyCount: companies.length });

      for (const company of companies) {
        try {
          log.info("discovery.sec_filing.processing", {
            companyId: company.id,
            companyName: company.name,
            ticker: company.ticker,
          });

          // Fetch recent filings from SEC EDGAR
          const filingData = await filingScraper.scrapeFilingsByCompanyName(
            company.name
          );

          if (!filingData) {
            log.warn("discovery.sec_filing.no_data", {
              companyName: company.name,
            });
            continue;
          }

          results.filingsProcessed++;

          // Process each filing
          for (const filing of filingData.filings.slice(0, 5)) {
            // Limit to 5 most recent filings per company
            try {
              await processFiling(filing, company.id, company.name, results);
            } catch (error) {
              const errorMsg = `Failed to process filing: ${filing.filingUrl} - ${String(error)}`;
              log.error("discovery.filing.failed", {
                filingUrl: filing.filingUrl,
                error: String(error),
              });
              results.errors.push(errorMsg);
            }
          }
        } catch (error) {
          const errorMsg = `Failed to process filings for ${company.name}: ${String(error)}`;
          log.error("discovery.sec_filing.error", {
            companyName: company.name,
            error: String(error),
          });
          results.errors.push(errorMsg);
        }
      }

      return { filingsProcessed: results.filingsProcessed };
    });

    // Step 3: GitHub organization activity
    await step.run("process-github-activity", async () => {
      const githubScraper = new GitHubScraper();
      const companies = await prisma.company.findMany({
        where: { websiteUrl: { not: null } },
        select: { id: true, name: true, websiteUrl: true },
      });

      for (const company of companies) {
        try {
          const domain = extractDomain(company.websiteUrl || "");
          const orgName = domain.split(".")[0];
          const signals = await githubScraper.scrape(orgName);
          
          for (const signal of signals.slice(0, 5)) {
            const mapped = {
              sourceUrl: signal.url,
              title: signal.title,
              rawContent: signal.description,
              publishedAt: signal.publishedAt,
            };
            await createSignalFromScraper(mapped, company.id, "TECH_SIGNAL", results);
          }
          results.githubOrgsProcessed++;
        } catch (error) {
          log.error("discovery.github.error", { companyName: company.name, error: String(error) });
        }
      }
    });

    // Step 4: Certificate transparency
    await step.run("process-cert-transparency", async () => {
      const certScraper = new CertTransparencyScraper();
      const companies = await prisma.company.findMany({
        where: { websiteUrl: { not: null } },
        select: { id: true, name: true, websiteUrl: true },
      });

      for (const company of companies) {
        try {
          const domain = extractDomain(company.websiteUrl || "");
          const signals = await certScraper.scrape(domain);
          
          for (const signal of signals.slice(0, 10)) {
            const mapped = {
              sourceUrl: signal.url,
              title: signal.title,
              rawContent: signal.description,
              publishedAt: signal.publishedAt,
            };
            await createSignalFromScraper(mapped, company.id, "TECH_SIGNAL", results);
          }
          results.certDomainsProcessed++;
        } catch (error) {
          log.error("discovery.cert.error", { companyName: company.name, error: String(error) });
        }
      }
    });

    // Step 5: Reddit financial subreddits
    await step.run("process-reddit-financial", async () => {
      const redditScraper = new RedditFinancialScraper();
      const companies = await prisma.company.findMany({
        where: { ticker: { not: null } },
        select: { id: true, name: true, ticker: true },
      });

      const tickers = companies.map(c => c.ticker).filter((t): t is string => t !== null);
      const signals = await redditScraper.scrape(tickers);
      
      for (const signal of signals.slice(0, 20)) {
        const mapped = {
          sourceUrl: signal.url,
          title: signal.title,
          rawContent: signal.bodyText,
          publishedAt: signal.publishedAt,
        };
        await createSignalFromScraper(mapped, companies[0]?.id || "reddit-stocks", "SOCIAL", results);
      }
      results.redditProcessed = 1;
    });

    // Step 6: Press release wires
    await step.run("process-press-releases", async () => {
      const pressScraper = new PressReleaseScraper();
      const signals = await pressScraper.scrape();
      
      const companies = await prisma.company.findMany({
        select: { id: true, name: true },
      });

      for (const signal of signals.slice(0, 30)) {
        const mapped = {
          sourceUrl: signal.url,
          title: signal.title,
          rawContent: signal.bodyText,
          publishedAt: signal.publishedAt,
        };
        const mentionedCompanies = extractCompanyMentions(signal.title + " " + signal.description, companies);
        for (const company of mentionedCompanies) {
          await createSignalFromScraper(mapped, company.id, "PRESS_RELEASE", results);
        }
      }
      results.pressReleasesProcessed = 1;
    });

    // Step 7: USPTO patents (if API key configured)
    await step.run("process-uspto-patents", async () => {
      const usptoScraper = new UspScraper();
      if (!usptoScraper.isConfigured) {
        log.info("discovery.uspto.skipped", { reason: "API key not configured" });
        return;
      }

      const companies = await prisma.company.findMany({
        select: { id: true, name: true },
      });

      for (const company of companies.slice(0, 10)) {
        try {
          const signals = await usptoScraper.scrapeByAssignee(company.name, 5);
          for (const signal of signals) {
            await createSignalFromScraper(signal, company.id, "PATENT", results);
          }
          results.usptoProcessed++;
        } catch (error) {
          log.error("discovery.uspto.error", { companyName: company.name, error: String(error) });
        }
      }
    });

    // Step 8: CourtListener litigation (if API key configured)
    await step.run("process-courtlistener", async () => {
      const courtScraper = new CourtListenerScraper();
      if (!courtScraper.isConfigured) {
        log.info("discovery.courtlistener.skipped", { reason: "API key not configured" });
        return;
      }

      const companies = await prisma.company.findMany({
        select: { id: true, name: true },
      });

      for (const company of companies.slice(0, 10)) {
        try {
          const signals = await courtScraper.scrapeByPartyName(company.name, 5);
          for (const signal of signals) {
            await createSignalFromScraper(signal, company.id, "LITIGATION", results);
          }
          results.courtListenerProcessed++;
        } catch (error) {
          log.error("discovery.courtlistener.error", { companyName: company.name, error: String(error) });
        }
      }
    });

    // Step 9: FDA drug events and device clearances
    await step.run("process-fda", async () => {
      const fdaScraper = new FdaScraper();
      const companies = await prisma.company.findMany({
        where: { OR: [{ ticker: { not: null } }, { name: { contains: "Pharma", mode: "insensitive" } }] },
        select: { id: true, name: true },
      });

      for (const company of companies.slice(0, 10)) {
        try {
          const drugSignals = await fdaScraper.scrapeDrugEvents(company.name, 5);
          for (const signal of drugSignals) {
            await createSignalFromScraper(signal, company.id, "FDA", results);
          }
          
          const deviceSignals = await fdaScraper.scrapeDeviceClearances(company.name, 5);
          for (const signal of deviceSignals) {
            await createSignalFromScraper(signal, company.id, "FDA", results);
          }
          results.fdaProcessed++;
        } catch (error) {
          log.error("discovery.fda.error", { companyName: company.name, error: String(error) });
        }
      }
    });

    // Step 10: SAM.gov contracts (if API key configured)
    await step.run("process-sam-contracts", async () => {
      const samScraper = new SamScraper();
      if (!samScraper.isConfigured) {
        log.info("discovery.sam.skipped", { reason: "API key not configured" });
        return;
      }

      const companies = await prisma.company.findMany({
        select: { id: true, name: true },
      });

      for (const company of companies.slice(0, 10)) {
        try {
          const signals = await samScraper.scrapeByVendorName(company.name, 5);
          for (const signal of signals) {
            await createSignalFromScraper(signal, company.id, "CONTRACT", results);
          }
          results.samProcessed++;
        } catch (error) {
          log.error("discovery.sam.error", { companyName: company.name, error: String(error) });
        }
      }
    });

    // Step 11: Wayback Machine website changes
    await step.run("process-wayback-changes", async () => {
      const waybackScraper = new WaybackScraper();
      const companies = await prisma.company.findMany({
        where: { websiteUrl: { not: null } },
        select: { id: true, name: true, websiteUrl: true },
      });

      for (const company of companies.slice(0, 10)) {
        try {
          const domain = extractDomain(company.websiteUrl || "");
          const signals = await waybackScraper.scrapeDomainChanges(domain, 10);
          for (const signal of signals) {
            await createSignalFromScraper(signal, company.id, "WEB_ARCHIVE", results);
          }
          results.waybackProcessed++;
        } catch (error) {
          log.error("discovery.wayback.error", { companyName: company.name, error: String(error) });
        }
      }
    });

    // Step 12: Congress.gov legislation (if API key configured)
    await step.run("process-congress-legislation", async () => {
      const congressScraper = new CongressScraper();
      if (!congressScraper.isConfigured()) {
        log.info("discovery.congress.skipped", { reason: "API key not configured" });
        return;
      }

      const companies = await prisma.company.findMany({
        select: { id: true, name: true },
      });

      for (const company of companies.slice(0, 10)) {
        try {
          const signals = await congressScraper.scrape(company.name, { limit: 5 });
          for (const signal of signals) {
            const mapped = {
              sourceUrl: signal.url,
              title: signal.title,
              rawContent: signal.summary,
              publishedAt: signal.publishedAt,
            };
            await createSignalFromScraper(mapped, company.id, "LEGISLATION", results);
          }
          results.congressProcessed++;
        } catch (error) {
          log.error("discovery.congress.error", { companyName: company.name, error: String(error) });
        }
      }
    });

    // Step 13: Academic papers
    await step.run("process-academic-papers", async () => {
      const academicScraper = new AcademicScraper();
      const companies = await prisma.company.findMany({
        where: { OR: [{ ticker: { not: null } }, { name: { contains: "Labs", mode: "insensitive" } }] },
        select: { id: true, name: true },
      });

      for (const company of companies.slice(0, 10)) {
        try {
          const signals = await academicScraper.scrape({ query: company.name, limit: 5 });
          for (const signal of signals) {
            const mapped = {
              sourceUrl: signal.url,
              title: signal.title,
              rawContent: signal.abstract,
              publishedAt: signal.publishedAt,
            };
            await createSignalFromScraper(mapped, company.id, "ACADEMIC", results);
          }
          results.academicProcessed++;
        } catch (error) {
          log.error("discovery.academic.error", { companyName: company.name, error: String(error) });
        }
      }
    });

    // Step 14: Log summary
    await step.run("log-summary", async () => {
      log.info("discovery.complete", {
        feedsProcessed: results.feedsProcessed,
        filingsProcessed: results.filingsProcessed,
        githubOrgsProcessed: results.githubOrgsProcessed,
        certDomainsProcessed: results.certDomainsProcessed,
        redditProcessed: results.redditProcessed,
        pressReleasesProcessed: results.pressReleasesProcessed,
        usptoProcessed: results.usptoProcessed,
        courtListenerProcessed: results.courtListenerProcessed,
        fdaProcessed: results.fdaProcessed,
        samProcessed: results.samProcessed,
        waybackProcessed: results.waybackProcessed,
        congressProcessed: results.congressProcessed,
        academicProcessed: results.academicProcessed,
        signalsCreated: results.signalsCreated,
        duplicatesSkipped: results.duplicatesSkipped,
        errorCount: results.errors.length,
      });

      if (results.errors.length > 0) {
        log.warn("discovery.errors", {
          errorCount: results.errors.length,
          errors: results.errors.slice(0, 10), // Log first 10 errors
        });
      }
    });

    return {
      success: true,
      ...results,
    };
  }
);

/**
 * Process a single RSS feed item and create a signal if it's new.
 */
async function processFeedItem(
  item: {
    title: string;
    link: string;
    description: string;
    content: string;
    pubDate: Date | null;
    guid?: string;
  },
  companyId: string,
  companyName: string,
  sourceType: SourceType,
  results: { signalsCreated: number; duplicatesSkipped: number }
): Promise<void> {
  const log = logger.child({
    function: "processFeedItem",
    itemUrl: item.link,
    companyId,
  });

  if (!item.link || !item.title) {
    log.warn("Skipping feed item: missing link or title");
    return;
  }

  // Normalize URL and compute content hash for deduplication
  const normalizedUrl = normalizeUrl(item.link);
  const content = item.content || item.description || item.title;
  const contentHash = computeContentHash(normalizedUrl, content);

  // Check if signal already exists
  const existingSignal = await prisma.signal.findUnique({
    where: { contentHash },
  });

  if (existingSignal) {
    log.info("Skipping duplicate signal", {
      contentHash,
      existingSignalId: existingSignal.id,
    });
    results.duplicatesSkipped++;
    return;
  }

  // Create new signal
  const signal = await prisma.signal.create({
    data: {
      sourceUrl: item.link,
      sourceType,
      title: item.title,
      rawContent: content,
      contentHash,
      publishedAt: item.pubDate,
      companyId,
      status: "PENDING",
    },
  });

  log.info("Created signal from RSS feed", {
    signalId: signal.id,
    sourceType,
    title: item.title,
  });

  results.signalsCreated++;

  // Trigger analysis via Inngest event
  try {
    await inngest.send({
      name: "signal/analysis.requested",
      data: { signalId: signal.id },
    });
    log.info("Triggered analysis for discovered signal", { signalId: signal.id });
  } catch (error) {
    log.error("Failed to trigger analysis", {
      signalId: signal.id,
      error: String(error),
    });
  }
}

/**
 * Process a single SEC filing and create a signal if it's new.
 */
async function processFiling(
  filing: {
    accessionNumber: string;
    filingDate: string;
    reportDate: string | null;
    form: string;
    filingUrl: string;
    primaryDocument: string;
    primaryDocUrl: string;
    description: string;
  },
  companyId: string,
  companyName: string,
  results: { signalsCreated: number; duplicatesSkipped: number }
): Promise<void> {
  const log = logger.child({
    function: "processFiling",
    filingUrl: filing.filingUrl,
    companyId,
  });

  if (!filing.filingUrl || !filing.form) {
    log.warn("Skipping filing: missing URL or form type");
    return;
  }

  // Normalize URL and compute content hash for deduplication
  const normalizedUrl = normalizeUrl(filing.filingUrl);
  const content = `${filing.form} - ${filing.description} filed ${filing.filingDate}`;
  const contentHash = computeContentHash(normalizedUrl, content);

  // Check if signal already exists
  const existingSignal = await prisma.signal.findUnique({
    where: { contentHash },
  });

  if (existingSignal) {
    log.info("Skipping duplicate filing", {
      contentHash,
      existingSignalId: existingSignal.id,
    });
    results.duplicatesSkipped++;
    return;
  }

  // Create new signal
  const signal = await prisma.signal.create({
    data: {
      sourceUrl: filing.filingUrl,
      sourceType: "FILING",
      title: `${filing.form} - ${companyName} (${filing.filingDate})`,
      rawContent: content,
      contentHash,
      publishedAt: new Date(filing.filingDate),
      companyId,
      status: "PENDING",
    },
  });

  log.info("Created signal from SEC filing", {
    signalId: signal.id,
    form: filing.form,
    filingDate: filing.filingDate,
  });

  results.signalsCreated++;

  // Trigger analysis via Inngest event
  try {
    await inngest.send({
      name: "signal/analysis.requested",
      data: { signalId: signal.id },
    });
    log.info("Triggered analysis for discovered filing", { signalId: signal.id });
  } catch (error) {
    log.error("Failed to trigger analysis", {
      signalId: signal.id,
      error: String(error),
    });
  }
}

/**
 * Generic helper to create a signal from any scraper result and trigger analysis.
 */
async function createSignalFromScraper(
  scraperSignal: {
    sourceUrl: string;
    title: string;
    rawContent: string;
    publishedAt: Date | null;
  },
  companyId: string,
  sourceType: SourceType,
  results: { signalsCreated: number; duplicatesSkipped: number }
): Promise<void> {
  const log = logger.child({
    function: "createSignalFromScraper",
    sourceUrl: scraperSignal.sourceUrl,
    companyId,
    sourceType,
  });

  if (!scraperSignal.sourceUrl || !scraperSignal.title) {
    log.warn("Skipping scraper signal: missing URL or title");
    return;
  }

  const normalizedUrl = normalizeUrl(scraperSignal.sourceUrl);
  const contentHash = computeContentHash(normalizedUrl, scraperSignal.rawContent);

  const existingSignal = await prisma.signal.findUnique({
    where: { contentHash },
  });

  if (existingSignal) {
    results.duplicatesSkipped++;
    return;
  }

  const signal = await prisma.signal.create({
    data: {
      sourceUrl: scraperSignal.sourceUrl,
      sourceType,
      title: scraperSignal.title,
      rawContent: scraperSignal.rawContent,
      contentHash,
      publishedAt: scraperSignal.publishedAt,
      companyId,
      status: "PENDING",
    },
  });

  log.info("Created signal from scraper", {
    signalId: signal.id,
    sourceType,
    title: scraperSignal.title,
  });

  results.signalsCreated++;

  try {
    await inngest.send({
      name: "signal/analysis.requested",
      data: { signalId: signal.id },
    });
  } catch (error) {
    log.error("Failed to trigger analysis", {
      signalId: signal.id,
      error: String(error),
    });
  }
}

/**
 * Extract domain from a URL.
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Extract company mentions from text by matching against known company names.
 */
function extractCompanyMentions(
  text: string,
  companies: Array<{ id: string; name: string }>
): Array<{ id: string; name: string }> {
  const lowerText = text.toLowerCase();
  return companies.filter((company) =>
    lowerText.includes(company.name.toLowerCase())
  );
}

export const discoveryFunctions = [discoverSignalsFunction];
