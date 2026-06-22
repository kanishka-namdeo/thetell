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
import { LobbyingScraper } from "@/lib/scraping/lobbying-scraper";
import { SupplierEarningScraper } from "@/lib/scraping/supplier-earning-scraper";
import { ExecutiveAppearanceScraper } from "@/lib/scraping/exec-appearance-scraper";
import { AppStoreTracker } from "@/lib/scraping/appstore-tracker";
import { DomainTracker } from "@/lib/scraping/domain-tracker";
import { ConferenceAgendaScraper } from "@/lib/scraping/conference-agenda-scraper";
import { AppStoreScraper } from "@/lib/scraping/app-store-scraper";
import { ConferenceScraper } from "@/lib/scraping/conference-scraper";
import { WebSearchScraper } from "@/lib/scraping/web-search-scraper";
import { generateSearchQueries, scoreRelevance } from "@/lib/ai/url-discovery";
import { getAllFeeds, getAllFeedsFromDB } from "@/lib/scraping/feed-registry";
import { normalizeUrl, computeContentHash } from "@/lib/scraping/url-normalizer";
import { logger } from "@/lib/logger";
import { generateEmbedding } from "@/lib/nlp/embedding-generator";
import { storeSignalEmbedding, findNearDuplicate } from "@/lib/nlp/embedding-store";
import type { SourceType, DataOrigin } from "@prisma/client";

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

    // Check if discovery is enabled in system config
    const systemConfig = await prisma.systemConfig.findFirst();
    if (systemConfig && systemConfig.discoveryEnabled === false) {
      log.info("discovery.skip.disabled", { reason: "Discovery disabled in system config" });
      return { skipped: true, reason: "Discovery disabled" };
    }

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
      lobbyingProcessed: 0,
      supplierEarningsProcessed: 0,
      execAppearancesProcessed: 0,
      appStoreProcessed: 0,
      domainProcessed: 0,
      conferenceProcessed: 0,
      dynamicUrlsDiscovered: 0,
      signalsCreated: 0,
      duplicatesSkipped: 0,
      errors: [] as string[],
    };

    // Step 1: Process RSS feeds
    await step.run("process-rss-feeds", async () => {
      // Try DB-backed feeds first, fall back to hardcoded if empty
      const dbFeeds = await getAllFeedsFromDB();
      const feeds = dbFeeds.length > 0 ? dbFeeds : getAllFeeds();
      log.info("discovery.rss_feeds.start", { feedCount: feeds.length });

      for (const companyFeed of feeds) {
        for (const feed of companyFeed.feeds) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;
          
          try {
            runId = await createPipelineRun(companyFeed.companyId, "rss-feed", feed.sourceType || "RSS");
            
            log.info("discovery.rss_feed.processing", {
              companyId: companyFeed.companyId,
              feedUrl: feed.url,
              label: feed.label,
            });

            const feedData = await rssScraper.scrapeFeed(feed.url);
            if (!feedData) {
              log.warn("discovery.rss_feed.failed", { feedUrl: feed.url });
              results.errors.push(`Failed to fetch feed: ${feed.url}`);
              await addPipelineLog(runId, "warn", "Failed to fetch feed", { url: feed.url });
              await completePipelineRun(runId, 0, 0);
              continue;
            }

            results.feedsProcessed++;
            await addPipelineLog(runId, "info", `Processing feed with ${feedData.items.length} items`, { url: feed.url });

            // Process each item in the feed
            for (const item of feedData.items.slice(0, 10)) {
              // Limit to 10 most recent items per feed
              try {
                const beforeCreated = results.signalsCreated;
                const beforeDuplicates = results.duplicatesSkipped;
                
                await processFeedItem(
                  item,
                  companyFeed.companyId,
                  companyFeed.companyName,
                  feed.sourceType || "RSS",
                  results,
                  runId,
                  feed.label,
                  rssScraper.getProvenance(),
                  rssScraper.scraperName,
                );
                
                runSignalsCreated += results.signalsCreated - beforeCreated;
                runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
              } catch (error) {
                const errorMsg = `Failed to process feed item: ${item.link} - ${String(error)}`;
                log.error("discovery.feed_item.failed", {
                  itemUrl: item.link,
                  error: String(error),
                });
                results.errors.push(errorMsg);
                await addPipelineLog(runId, "error", `Failed to process feed item`, { url: item.link, error: String(error) });
              }
            }
            
            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            const errorMsg = `Failed to process feed: ${feed.url} - ${String(error)}`;
            log.error("discovery.rss_feed.error", {
              feedUrl: feed.url,
              error: String(error),
            });
            results.errors.push(errorMsg);
            if (runId) {
              await failPipelineRun(runId, String(error));
            }
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
        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;

        try {
          runId = await createPipelineRun(company.id, "sec-filing", "FILING");

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
            await addPipelineLog(runId, "warn", "No filing data returned from EDGAR");
            await completePipelineRun(runId, 0, 0);
            continue;
          }

          results.filingsProcessed++;
          await addPipelineLog(runId, "info", `Processing ${filingData.filings.length} filings`, { ticker: company.ticker });

          // Process each filing
          for (const filing of filingData.filings.slice(0, 5)) {
            // Limit to 5 most recent filings per company
            try {
              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;

              await processFiling(filing, company.id, company.name, results, runId, filingScraper.getProvenance(), filingScraper.scraperName);

              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            } catch (error) {
              const errorMsg = `Failed to process filing: ${filing.filingUrl} - ${String(error)}`;
              log.error("discovery.filing.failed", {
                filingUrl: filing.filingUrl,
                error: String(error),
              });
              results.errors.push(errorMsg);
              await addPipelineLog(runId, "error", `Failed to process filing`, { url: filing.filingUrl, error: String(error) });
            }
          }

          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          const errorMsg = `Failed to process filings for ${company.name}: ${String(error)}`;
          log.error("discovery.sec_filing.error", {
            companyName: company.name,
            error: String(error),
          });
          results.errors.push(errorMsg);
          if (runId) {
            await failPipelineRun(runId, String(error));
          }
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
        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;

        try {
          runId = await createPipelineRun(company.id, "github", "TECH_SIGNAL");

          const domain = extractDomain(company.websiteUrl || "");
          const orgName = domain.split(".")[0];
          await addPipelineLog(runId, "info", `Scraping GitHub org: ${orgName}`);

          const signals = await githubScraper.scrape(orgName, process.env.GITHUB_TOKEN);
          await addPipelineLog(runId, "info", `Found ${signals.length} signals from GitHub`);

          for (const signal of signals.slice(0, 5)) {
            const mapped = {
              sourceUrl: signal.url,
              title: signal.title,
              rawContent: signal.description,
              publishedAt: signal.publishedAt,
            };

            const beforeCreated = results.signalsCreated;
            const beforeDuplicates = results.duplicatesSkipped;

            await createSignalFromScraper(mapped, company.id, "TECH_SIGNAL", results, runId, githubScraper.getProvenance(), githubScraper.scraperName);

            runSignalsCreated += results.signalsCreated - beforeCreated;
            runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
          }

          results.githubOrgsProcessed++;
          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          log.error("discovery.github.error", { companyName: company.name, error: String(error) });
          if (runId) {
            await failPipelineRun(runId, String(error));
          }
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
        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;

        try {
          runId = await createPipelineRun(company.id, "cert-transparency", "TECH_SIGNAL");

          const domain = extractDomain(company.websiteUrl || "");
          await addPipelineLog(runId, "info", `Scraping cert transparency for domain: ${domain}`);

          const signals = await certScraper.scrape(domain);
          await addPipelineLog(runId, "info", `Found ${signals.length} cert transparency signals`);

          for (const signal of signals.slice(0, 10)) {
            const mapped = {
              sourceUrl: signal.url,
              title: signal.title,
              rawContent: signal.description,
              publishedAt: signal.publishedAt,
            };

            const beforeCreated = results.signalsCreated;
            const beforeDuplicates = results.duplicatesSkipped;

            await createSignalFromScraper(mapped, company.id, "TECH_SIGNAL", results, runId, certScraper.getProvenance(), certScraper.scraperName);

            runSignalsCreated += results.signalsCreated - beforeCreated;
            runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
          }

          results.certDomainsProcessed++;
          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          log.error("discovery.cert.error", { companyName: company.name, error: String(error) });
          if (runId) {
            await failPipelineRun(runId, String(error));
          }
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

      // Track runs per company
      const companyRuns = new Map<string, { runId: string; signalsCreated: number; duplicatesSkipped: number }>();

      // Process each signal and assign to mentioned companies
      for (const signal of signals.slice(0, 20)) {
        const textToSearch = signal.title + " " + signal.bodyText;
        const mentionedCompanies = extractCompanyMentions(textToSearch, companies);

        // If no companies mentioned, skip this signal
        if (mentionedCompanies.length === 0) {
          log.debug("No company mentions found in Reddit signal", { title: signal.title });
          continue;
        }

        // Create signal for each mentioned company
        for (const company of mentionedCompanies) {
          // Create run if not exists for this company
          if (!companyRuns.has(company.id)) {
            const runId = await createPipelineRun(company.id, "reddit-financial", "SOCIAL");
            companyRuns.set(company.id, { runId, signalsCreated: 0, duplicatesSkipped: 0 });
            await addPipelineLog(runId, "info", `Processing Reddit signals for ${company.name}`);
          }

          const runData = companyRuns.get(company.id)!;
          const beforeCreated = results.signalsCreated;
          const beforeDuplicates = results.duplicatesSkipped;

          const mapped = {
            sourceUrl: signal.url,
            title: signal.title,
            rawContent: signal.bodyText,
            publishedAt: signal.publishedAt,
            engagement: signal.engagement,
            author: signal.author ?? undefined,
            metadata: signal.metadata,
          };
          await createSignalFromScraper(mapped, company.id, "SOCIAL", results, runData.runId, redditScraper.getProvenance(), redditScraper.scraperName);

          runData.signalsCreated += results.signalsCreated - beforeCreated;
          runData.duplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
        }
      }

      // Complete all runs
      for (const [, runData] of companyRuns) {
        await completePipelineRun(runData.runId, runData.signalsCreated, runData.duplicatesSkipped);
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

      // Track runs per company
      const companyRuns = new Map<string, { runId: string; signalsCreated: number; duplicatesSkipped: number }>();

      for (const signal of signals.slice(0, 30)) {
        const mapped = {
          sourceUrl: signal.url,
          title: signal.title,
          rawContent: signal.bodyText,
          publishedAt: signal.publishedAt,
        };
        const mentionedCompanies = extractCompanyMentions(signal.title + " " + signal.description, companies);

        for (const company of mentionedCompanies) {
          // Create run if not exists for this company
          if (!companyRuns.has(company.id)) {
            const runId = await createPipelineRun(company.id, "press-release", "PRESS_RELEASE");
            companyRuns.set(company.id, { runId, signalsCreated: 0, duplicatesSkipped: 0 });
            await addPipelineLog(runId, "info", `Processing press releases for ${company.name}`);
          }

          const runData = companyRuns.get(company.id)!;
          const beforeCreated = results.signalsCreated;
          const beforeDuplicates = results.duplicatesSkipped;

          await createSignalFromScraper(mapped, company.id, "PRESS_RELEASE", results, runData.runId, pressScraper.getProvenance(), pressScraper.scraperName);

          runData.signalsCreated += results.signalsCreated - beforeCreated;
          runData.duplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
        }
      }

      // Complete all runs
      for (const [, runData] of companyRuns) {
        await completePipelineRun(runData.runId, runData.signalsCreated, runData.duplicatesSkipped);
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
        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;
        try {
          runId = await createPipelineRun(company.id, "uspto", "PATENT");
          const signals = await usptoScraper.scrapeByAssignee(company.name, 5);
          await addPipelineLog(runId, "info", `Found ${signals.length} patent signals for ${company.name}`);

          for (const signal of signals) {
            const beforeCreated = results.signalsCreated;
            const beforeDuplicates = results.duplicatesSkipped;
            await createSignalFromScraper(signal, company.id, "PATENT", results, runId, usptoScraper.getProvenance(), usptoScraper.scraperName);
            runSignalsCreated += results.signalsCreated - beforeCreated;
            runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
          }
          results.usptoProcessed++;
          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          log.error("discovery.uspto.error", { companyName: company.name, error: String(error) });
          if (runId) await failPipelineRun(runId, String(error));
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
        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;
        try {
          runId = await createPipelineRun(company.id, "courtlistener", "LITIGATION");
          const signals = await courtScraper.scrapeByPartyName(company.name, 5);
          await addPipelineLog(runId, "info", `Found ${signals.length} litigation signals for ${company.name}`);

          for (const signal of signals) {
            const beforeCreated = results.signalsCreated;
            const beforeDuplicates = results.duplicatesSkipped;
            await createSignalFromScraper(signal, company.id, "LITIGATION", results, runId, courtScraper.getProvenance(), courtScraper.scraperName);
            runSignalsCreated += results.signalsCreated - beforeCreated;
            runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
          }
          results.courtListenerProcessed++;
          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          log.error("discovery.courtlistener.error", { companyName: company.name, error: String(error) });
          if (runId) await failPipelineRun(runId, String(error));
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
        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;
        try {
          runId = await createPipelineRun(company.id, "fda", "FDA");

          const drugSignals = await fdaScraper.scrapeDrugEvents(company.name, 5);
          await addPipelineLog(runId, "info", `Found ${drugSignals.length} drug event signals for ${company.name}`);
          for (const signal of drugSignals) {
            const beforeCreated = results.signalsCreated;
            const beforeDuplicates = results.duplicatesSkipped;
            await createSignalFromScraper(signal, company.id, "FDA", results, runId, fdaScraper.getProvenance(), fdaScraper.scraperName);
            runSignalsCreated += results.signalsCreated - beforeCreated;
            runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
          }

          const deviceSignals = await fdaScraper.scrapeDeviceClearances(company.name, 5);
          await addPipelineLog(runId, "info", `Found ${deviceSignals.length} device clearance signals for ${company.name}`);
          for (const signal of deviceSignals) {
            const beforeCreated = results.signalsCreated;
            const beforeDuplicates = results.duplicatesSkipped;
            await createSignalFromScraper(signal, company.id, "FDA", results, runId, fdaScraper.getProvenance(), fdaScraper.scraperName);
            runSignalsCreated += results.signalsCreated - beforeCreated;
            runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
          }
          results.fdaProcessed++;
          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          log.error("discovery.fda.error", { companyName: company.name, error: String(error) });
          if (runId) await failPipelineRun(runId, String(error));
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
        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;
        try {
          runId = await createPipelineRun(company.id, "sam", "CONTRACT");
          const signals = await samScraper.scrapeByVendorName(company.name, 5);
          await addPipelineLog(runId, "info", `Found ${signals.length} contract signals for ${company.name}`);

          for (const signal of signals) {
            const beforeCreated = results.signalsCreated;
            const beforeDuplicates = results.duplicatesSkipped;
            await createSignalFromScraper(signal, company.id, "CONTRACT", results, runId, samScraper.getProvenance(), samScraper.scraperName);
            runSignalsCreated += results.signalsCreated - beforeCreated;
            runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
          }
          results.samProcessed++;
          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          log.error("discovery.sam.error", { companyName: company.name, error: String(error) });
          if (runId) await failPipelineRun(runId, String(error));
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
        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;
        try {
          runId = await createPipelineRun(company.id, "wayback", "WEB_ARCHIVE");
          const domain = extractDomain(company.websiteUrl || "");
          const signals = await waybackScraper.scrapeDomainChanges(domain, 10);
          await addPipelineLog(runId, "info", `Found ${signals.length} wayback signals for ${domain}`);

          for (const signal of signals) {
            const beforeCreated = results.signalsCreated;
            const beforeDuplicates = results.duplicatesSkipped;
            await createSignalFromScraper(signal, company.id, "WEB_ARCHIVE", results, runId, waybackScraper.getProvenance(), waybackScraper.scraperName);
            runSignalsCreated += results.signalsCreated - beforeCreated;
            runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
          }
          results.waybackProcessed++;
          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          log.error("discovery.wayback.error", { companyName: company.name, error: String(error) });
          if (runId) await failPipelineRun(runId, String(error));
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
        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;
        try {
          runId = await createPipelineRun(company.id, "congress", "LEGISLATION");
          const signals = await congressScraper.scrape(company.name, { limit: 5 });
          await addPipelineLog(runId, "info", `Found ${signals.length} legislation signals for ${company.name}`);

          for (const signal of signals) {
            const mapped = {
              sourceUrl: signal.url,
              title: signal.title,
              rawContent: signal.summary,
              publishedAt: signal.publishedAt,
            };
            const beforeCreated = results.signalsCreated;
            const beforeDuplicates = results.duplicatesSkipped;
            await createSignalFromScraper(mapped, company.id, "LEGISLATION", results, runId, congressScraper.getProvenance(), congressScraper.scraperName);
            runSignalsCreated += results.signalsCreated - beforeCreated;
            runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
          }
          results.congressProcessed++;
          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          log.error("discovery.congress.error", { companyName: company.name, error: String(error) });
          if (runId) await failPipelineRun(runId, String(error));
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
        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;
        try {
          runId = await createPipelineRun(company.id, "academic", "ACADEMIC");
          const signals = await academicScraper.scrape({ query: company.name, limit: 5 });
          await addPipelineLog(runId, "info", `Found ${signals.length} academic signals for ${company.name}`);

          for (const signal of signals) {
            const mapped = {
              sourceUrl: signal.url,
              title: signal.title,
              rawContent: signal.abstract,
              publishedAt: signal.publishedAt,
            };
            const beforeCreated = results.signalsCreated;
            const beforeDuplicates = results.duplicatesSkipped;
            await createSignalFromScraper(mapped, company.id, "ACADEMIC", results, runId, academicScraper.getProvenance(), academicScraper.scraperName);
            runSignalsCreated += results.signalsCreated - beforeCreated;
            runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
          }
          results.academicProcessed++;
          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          log.error("discovery.academic.error", { companyName: company.name, error: String(error) });
          if (runId) await failPipelineRun(runId, String(error));
        }
      }
    });

    // Step 14: Lobbying disclosures
    await step.run("process-lobbying-disclosures", async () => {
      const lobbyingScraper = new LobbyingScraper();
      const companies = await prisma.company.findMany({
        where: { ticker: { not: null } },
        select: { id: true, name: true },
        take: 10,
      });
      for (const company of companies) {
        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;
        try {
          runId = await createPipelineRun(company.id, "lobbying", "LOBBYING");
          const disclosures = await lobbyingScraper.scrapeLobbying(company.name);
          await addPipelineLog(runId, "info", `Found ${disclosures?.length ?? 0} lobbying disclosures for ${company.name}`);
          if (disclosures) {
            for (const disclosure of disclosures.slice(0, 5)) {
              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;
              await createSignalFromScraper(
                { sourceUrl: disclosure.url, title: `${company.name} Lobbying: ${disclosure.issue}`, rawContent: `${disclosure.registrant} filed lobbying disclosure for ${disclosure.issue}. Amount: ${disclosure.amount ?? "N/A"}. Period: ${disclosure.period}`, publishedAt: disclosure.filedAt },
                company.id, "LOBBYING", results, runId, lobbyingScraper.getProvenance(), lobbyingScraper.scraperName
              );
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }
          }
          results.lobbyingProcessed++;
          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          log.error("discovery.lobbying.error", { companyName: company.name, error: String(error) });
          if (runId) await failPipelineRun(runId, String(error));
        }
      }
    });

    // Step 15: Supplier earnings
    await step.run("process-supplier-earnings", async () => {
      const supplierScraper = new SupplierEarningScraper();
      const companies = await prisma.company.findMany({
        where: { ticker: { not: null } },
        select: { id: true, name: true },
        take: 10,
      });
      for (const company of companies) {
        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;
        try {
          runId = await createPipelineRun(company.id, "supplier-earnings", "TRANSCRIPT");
          const earnings = await supplierScraper.scrapeEarnings(company.name);
          await addPipelineLog(runId, "info", `Found ${earnings?.length ?? 0} supplier earnings for ${company.name}`);
          if (earnings) {
            for (const earning of earnings.slice(0, 5)) {
              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;
              await createSignalFromScraper(
                { sourceUrl: earning.url, title: `${earning.supplier} Q${earning.quarter} ${earning.year} - ${company.name} References`, rawContent: `Supplier ${earning.supplier} earnings report. Customer mentions: ${earning.customerMentions.map(m => `${m.customer} (${m.sentiment})`).join(", ")}. Guidance: ${earning.revenueGuidance ?? "N/A"}`, publishedAt: earning.publishedAt },
                company.id, "TRANSCRIPT", results, runId, supplierScraper.getProvenance(), supplierScraper.scraperName
              );
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }
          }
          results.supplierEarningsProcessed++;
          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          log.error("discovery.supplier_earnings.error", { companyName: company.name, error: String(error) });
          if (runId) await failPipelineRun(runId, String(error));
        }
      }
    });

    // Step 16: Executive appearances
    await step.run("process-executive-appearances", async () => {
      const execScraper = new ExecutiveAppearanceScraper();
      const companies = await prisma.company.findMany({
        where: { ticker: { not: null } },
        select: { id: true, name: true },
        take: 10,
      });
      for (const company of companies) {
        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;
        try {
          runId = await createPipelineRun(company.id, "exec-appearances", "CONFERENCE");
          const appearances = await execScraper.scrapeAppearances(company.name);
          await addPipelineLog(runId, "info", `Found ${appearances?.length ?? 0} executive appearances for ${company.name}`);
          if (appearances) {
            for (const appearance of appearances.slice(0, 5)) {
              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;
              await createSignalFromScraper(
                { sourceUrl: appearance.url, title: appearance.title, rawContent: `${appearance.executive} at ${appearance.event}: ${appearance.summary}`, publishedAt: appearance.publishedAt },
                company.id, "CONFERENCE", results, runId, execScraper.getProvenance(), execScraper.scraperName
              );
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }
          }
          results.execAppearancesProcessed++;
          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          log.error("discovery.exec_appearances.error", { companyName: company.name, error: String(error) });
          if (runId) await failPipelineRun(runId, String(error));
        }
      }
    });

    // Step 18: App Store RSS feeds
    await step.run("process-app-store-rss", async () => {
      const appStoreScraper = new AppStoreScraper();
      const companies = await prisma.company.findMany({
        where: { ticker: { not: null } },
        select: { id: true, name: true },
        take: 10,
      });
      for (const company of companies) {
        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;
        try {
          runId = await createPipelineRun(company.id, "app-store", "TECH_SIGNAL");
          const signals = await appStoreScraper.scrape(company.name);
          await addPipelineLog(runId, "info", `Found ${signals.length} App Store signals for ${company.name}`);
          for (const signal of signals.slice(0, 10)) {
            const mapped = {
              sourceUrl: signal.url,
              title: signal.title,
              rawContent: signal.description,
              publishedAt: signal.publishedAt,
            };
            const beforeCreated = results.signalsCreated;
            const beforeDuplicates = results.duplicatesSkipped;
            await createSignalFromScraper(mapped, company.id, "TECH_SIGNAL", results, runId, appStoreScraper.getProvenance(), appStoreScraper.scraperName);
            runSignalsCreated += results.signalsCreated - beforeCreated;
            runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
          }
          results.appStoreProcessed++;
          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          log.error("discovery.app_store.error", { companyName: company.name, error: String(error) });
          if (runId) await failPipelineRun(runId, String(error));
        }
      }
    });

    // Step 19: Conference agendas
    await step.run("process-conference-agendas", async () => {
      const conferenceScraper = new ConferenceScraper();
      const companies = await prisma.company.findMany({
        where: { ticker: { not: null } },
        select: { id: true, name: true },
        take: 10,
      });
      for (const company of companies) {
        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;
        try {
          runId = await createPipelineRun(company.id, "conference", "CONFERENCE");
          const signals = await conferenceScraper.scrape(company.name);
          await addPipelineLog(runId, "info", `Found ${signals.length} conference signals for ${company.name}`);
          for (const signal of signals.slice(0, 10)) {
            const mapped = {
              sourceUrl: signal.url,
              title: signal.title,
              rawContent: signal.description,
              publishedAt: signal.publishedAt,
            };
            const beforeCreated = results.signalsCreated;
            const beforeDuplicates = results.duplicatesSkipped;
            await createSignalFromScraper(mapped, company.id, "CONFERENCE", results, runId, conferenceScraper.getProvenance(), conferenceScraper.scraperName);
            runSignalsCreated += results.signalsCreated - beforeCreated;
            runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
          }
          results.conferenceProcessed++;
          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          log.error("discovery.conference.error", { companyName: company.name, error: String(error) });
          if (runId) await failPipelineRun(runId, String(error));
        }
      }
    });

    // Step 20: Domain registrations
    await step.run("process-domain-registrations", async () => {
      const domainTracker = new DomainTracker();
      const companies = await prisma.company.findMany({
        where: { ticker: { not: null } },
        select: { id: true, name: true },
        take: 10,
      });
      for (const company of companies) {
        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;
        try {
          runId = await createPipelineRun(company.id, "domain-tracker", "TECH_SIGNAL");
          const registrations = await domainTracker.scrapeDomains(company.name);
          await addPipelineLog(runId, "info", `Found ${registrations?.length ?? 0} domain registrations for ${company.name}`);
          if (registrations) {
            for (const reg of registrations.slice(0, 5)) {
              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;
              await createSignalFromScraper(
                { sourceUrl: reg.url, title: `${company.name} registered ${reg.domain}`, rawContent: `Domain ${reg.domain} registered by ${reg.registrant} via ${reg.registrar}`, publishedAt: reg.registeredAt },
                company.id, "TECH_SIGNAL", results, runId, domainTracker.getProvenance(), domainTracker.scraperName
              );
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }
          }
          results.domainProcessed++;
          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          log.error("discovery.domain_registrations.error", { companyName: company.name, error: String(error) });
          if (runId) await failPipelineRun(runId, String(error));
        }
      }
    });

    // Step 21: Dynamic URL discovery via web search
    await step.run("discover-urls-dynamic", async () => {
      const webSearchScraper = new WebSearchScraper();

      // Get companies that have at least one signal
      const companies = await prisma.company.findMany({
        where: { signals: { some: {} } },
        select: {
          id: true,
          name: true,
          ticker: true,
          description: true,
          websiteUrl: true,
          slug: true,
          industry: true,
          sector: true,
          createdAt: true,
          updatedAt: true,
        },
        take: 10, // Reduced for Brave free tier (~1,000 queries/month)
      });

      log.info("discovery.dynamic_urls.start", { 
        companyCount: companies.length,
        provider: webSearchScraper.hasBraveKey ? "brave" : "duckduckgo",
      });

      let totalQueries = 0;
      const MAX_TOTAL_QUERIES = 30; // Conservative for Brave free tier
      const MAX_QUERIES_PER_COMPANY = 3;

      for (const company of companies) {
        if (totalQueries >= MAX_TOTAL_QUERIES) {
          log.info("discovery.dynamic_urls.rate_limit_reached", { totalQueries });
          break;
        }

        let runId: string | null = null;
        let runSignalsCreated = 0;
        let runDuplicatesSkipped = 0;

        try {
          runId = await createPipelineRun(company.id, "web-search", "NEWS");

          // Load active hypotheses for this company
          const hypotheses = await prisma.companyHypothesis.findMany({
            where: { companyId: company.id, status: "ACTIVE" },
          });

          // Load top themes by momentum
          const themes = await prisma.signalTheme.findMany({
            where: { companyId: company.id },
            orderBy: { momentum: "desc" },
            take: 10,
          });

          await addPipelineLog(runId, "info", `Generating search queries for ${company.name}`, {
            hypothesisCount: hypotheses.length,
            themeCount: themes.length,
          });

          // Generate search queries using LLM
          const queries = await generateSearchQueries(company, hypotheses, themes);

          // Take top 5 queries by priority
          const topQueries = queries
            .sort((a, b) => b.priority - a.priority)
            .slice(0, MAX_QUERIES_PER_COMPANY);

          await addPipelineLog(runId, "info", `Generated ${topQueries.length} search queries`);

          // Execute searches and collect results
          const allResults: Array<{ url: string; title: string; snippet: string; publishedAt?: string }> = [];
          let queriesUsed = 0;

          for (const q of topQueries) {
            if (totalQueries + queriesUsed >= MAX_TOTAL_QUERIES) break;

            try {
              const searchResults = await webSearchScraper.search(q.query, { searchType: "news" });
              for (const r of searchResults) {
                allResults.push({
                  url: r.url,
                  title: r.title,
                  snippet: r.snippet,
                  publishedAt: r.publishedAt?.toISOString(),
                });
              }
              queriesUsed++;
              totalQueries++;
            } catch (error) {
              log.warn("discovery.dynamic_urls.search_failed", {
                query: q.query.slice(0, 80),
                error: String(error),
              });
            }
          }

          await addPipelineLog(runId, "info", `Collected ${allResults.length} search results from ${queriesUsed} queries`);

          // Score relevance
          const scoredUrls = await scoreRelevance(allResults, company);

          await addPipelineLog(runId, "info", `Scored ${scoredUrls.length} URLs above threshold`);

          // Create signals for high-relevance URLs
          for (const scored of scoredUrls) {
            const beforeCreated = results.signalsCreated;
            const beforeDuplicates = results.duplicatesSkipped;

            await createSignalFromScraper(
              {
                sourceUrl: scored.url,
                title: scored.rationale.slice(0, 200),
                rawContent: `Dynamically discovered via web search. Query: ${scored.url}. Score: ${scored.score.toFixed(2)}. ${scored.rationale}`,
                publishedAt: new Date(),
              },
              company.id,
              (scored.sourceType as SourceType) || "NEWS",
              results,
              runId,
              undefined,
              "web-search-scraper"
            );

            runSignalsCreated += results.signalsCreated - beforeCreated;
            runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
          }

          results.dynamicUrlsDiscovered += runSignalsCreated;
          await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
        } catch (error) {
          log.error("discovery.dynamic_urls.error", { companyName: company.name, error: String(error) });
          results.errors.push(`Dynamic URL discovery failed for ${company.name}: ${String(error)}`);
          if (runId) await failPipelineRun(runId, String(error));
        }
      }

      log.info("discovery.dynamic_urls.complete", {
        totalQueries,
        dynamicUrlsDiscovered: results.dynamicUrlsDiscovered,
      });

      return { dynamicUrlsDiscovered: results.dynamicUrlsDiscovered };
    });

    // Step 22: Log summary
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
        lobbyingProcessed: results.lobbyingProcessed,
        supplierEarningsProcessed: results.supplierEarningsProcessed,
        execAppearancesProcessed: results.execAppearancesProcessed,
        dynamicUrlsDiscovered: results.dynamicUrlsDiscovered,
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
  results: { signalsCreated: number; duplicatesSkipped: number },
  runId?: string | null,
  feedLabel?: string,
  provenance?: { scrapeAttempts: number; rawContentHash: string | null },
  scraperName?: string,
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
    if (runId) {
      await addPipelineLog(runId, "warn", `Skipped duplicate signal`, { url: item.link, contentHash });
    }
    return;
  }

  // Semantic near-duplicate detection via embeddings
  try {
    const embedding = await generateEmbedding(content);
    const nearDuplicateId = await findNearDuplicate(embedding);
    if (nearDuplicateId) {
      log.info("Skipping near-duplicate signal (semantic)", {
        itemUrl: item.link,
        nearDuplicateId,
      });
      results.duplicatesSkipped++;
      if (runId) {
        await addPipelineLog(runId, "warn", `Skipped near-duplicate signal (semantic)`, { url: item.link, nearDuplicateId });
      }
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
        scraperName: scraperName ?? null,
        verified: true,
        scrapeAttempts: provenance?.scrapeAttempts ?? null,
        rawContentHash: provenance?.rawContentHash ?? null,
        feedLabel: feedLabel ?? null,
        dataOrigin: "SCRAPED",
      },
    });

    // Store embedding for the new signal
    await storeSignalEmbedding(signal.id, embedding);

    log.info("Created signal from RSS feed", {
      signalId: signal.id,
      sourceType,
      title: item.title,
    });

    results.signalsCreated++;
    if (runId) {
      await addPipelineLog(runId, "info", `Created signal: ${item.title}`, { url: item.link, signalId: signal.id });
    }

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
  } catch (embedError) {
    log.warn("Embedding generation failed, creating signal without semantic dedup", {
      itemUrl: item.link,
      error: String(embedError),
    });

    // Fallback: create signal without embedding
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
        scraperName: scraperName ?? null,
        verified: true,
        scrapeAttempts: provenance?.scrapeAttempts ?? null,
        rawContentHash: provenance?.rawContentHash ?? null,
        feedLabel: feedLabel ?? null,
        dataOrigin: "SCRAPED",
      },
    });

    log.info("Created signal from RSS feed (no embedding)", {
      signalId: signal.id,
      sourceType,
      title: item.title,
    });

    results.signalsCreated++;
    if (runId) {
      await addPipelineLog(runId, "info", `Created signal: ${item.title}`, { url: item.link, signalId: signal.id });
    }

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
  results: { signalsCreated: number; duplicatesSkipped: number },
  runId?: string | null,
  provenance?: { scrapeAttempts: number; rawContentHash: string | null },
  scraperName?: string,
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
    if (runId) {
      await addPipelineLog(runId, "warn", `Skipped duplicate filing`, { url: filing.filingUrl, contentHash });
    }
    return;
  }

  // Semantic near-duplicate detection via embeddings
  try {
    const embedding = await generateEmbedding(content);
    const nearDuplicateId = await findNearDuplicate(embedding);
    if (nearDuplicateId) {
      log.info("Skipping near-duplicate filing (semantic)", {
        filingUrl: filing.filingUrl,
        nearDuplicateId,
      });
      results.duplicatesSkipped++;
      if (runId) {
        await addPipelineLog(runId, "warn", `Skipped near-duplicate filing (semantic)`, { url: filing.filingUrl, nearDuplicateId });
      }
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
        scraperName: scraperName ?? null,
        verified: true,
        scrapeAttempts: provenance?.scrapeAttempts ?? null,
        rawContentHash: provenance?.rawContentHash ?? null,
        dataOrigin: "SCRAPED",
      },
    });

    // Store embedding for the new signal
    await storeSignalEmbedding(signal.id, embedding);

    log.info("Created signal from SEC filing", {
      signalId: signal.id,
      form: filing.form,
      filingDate: filing.filingDate,
    });

    results.signalsCreated++;
    if (runId) {
      await addPipelineLog(runId, "info", `Created signal: ${filing.form} - ${companyName}`, { url: filing.filingUrl, signalId: signal.id });
    }

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
  } catch (embedError) {
    log.warn("Embedding generation failed for filing, creating without semantic dedup", {
      filingUrl: filing.filingUrl,
      error: String(embedError),
    });

    // Fallback: create signal without embedding
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
        scraperName: scraperName ?? null,
        verified: true,
        scrapeAttempts: provenance?.scrapeAttempts ?? null,
        rawContentHash: provenance?.rawContentHash ?? null,
        dataOrigin: "SCRAPED",
      },
    });

    log.info("Created signal from SEC filing (no embedding)", {
      signalId: signal.id,
      form: filing.form,
      filingDate: filing.filingDate,
    });

    results.signalsCreated++;
    if (runId) {
      await addPipelineLog(runId, "info", `Created signal: ${filing.form} - ${companyName}`, { url: filing.filingUrl, signalId: signal.id });
    }

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
    engagement?: Record<string, unknown>;
    author?: string;
    metadata?: Record<string, unknown>;
  },
  companyId: string,
  sourceType: SourceType,
  results: { signalsCreated: number; duplicatesSkipped: number },
  runId?: string | null,
  provenance?: { scrapeAttempts: number; rawContentHash: string | null },
  scraperName?: string,
): Promise<{ created: boolean }> {
  const log = logger.child({
    function: "createSignalFromScraper",
    sourceUrl: scraperSignal.sourceUrl,
    companyId,
    sourceType,
  });

  if (!scraperSignal.sourceUrl || !scraperSignal.title) {
    log.warn("Skipping scraper signal: missing URL or title");
    return { created: false };
  }

  const normalizedUrl = normalizeUrl(scraperSignal.sourceUrl);
  const contentHash = computeContentHash(normalizedUrl, scraperSignal.rawContent);

  const existingSignal = await prisma.signal.findUnique({
    where: { contentHash },
  });

  if (existingSignal) {
    results.duplicatesSkipped++;
    if (runId) {
      await addPipelineLog(runId, "warn", `Skipped duplicate signal`, { url: scraperSignal.sourceUrl, contentHash });
    }
    return { created: false };
  }

  // Semantic near-duplicate detection via embeddings
  try {
    const embedding = await generateEmbedding(scraperSignal.rawContent);
    const nearDuplicateId = await findNearDuplicate(embedding);
    if (nearDuplicateId) {
      log.info("Skipping near-duplicate signal (semantic)", {
        sourceUrl: scraperSignal.sourceUrl,
        nearDuplicateId,
      });
      results.duplicatesSkipped++;
      if (runId) {
        await addPipelineLog(runId, "warn", `Skipped near-duplicate signal (semantic)`, { url: scraperSignal.sourceUrl, nearDuplicateId });
      }
      return { created: false };
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
        engagement: (scraperSignal.engagement as Prisma.InputJsonValue) ?? undefined,
        author: scraperSignal.author ?? undefined,
        metadata: (scraperSignal.metadata as Prisma.InputJsonValue) ?? undefined,
        scraperName: scraperName ?? null,
        verified: true,
        scrapeAttempts: provenance?.scrapeAttempts ?? null,
        rawContentHash: provenance?.rawContentHash ?? null,
        dataOrigin: "SCRAPED",
      },
    });

    // Store embedding for the new signal
    await storeSignalEmbedding(signal.id, embedding);

    log.info("Created signal from scraper", {
      signalId: signal.id,
      sourceType,
      title: scraperSignal.title,
    });

    results.signalsCreated++;
    if (runId) {
      await addPipelineLog(runId, "info", `Created signal: ${scraperSignal.title}`, { url: scraperSignal.sourceUrl, signalId: signal.id });
    }

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

    return { created: true };
  } catch (embedError) {
    log.warn("Embedding generation failed for scraper signal, creating without semantic dedup", {
      sourceUrl: scraperSignal.sourceUrl,
      error: String(embedError),
    });

    // Fallback: create signal without embedding
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
        engagement: (scraperSignal.engagement as Prisma.InputJsonValue) ?? undefined,
        author: scraperSignal.author ?? undefined,
        metadata: (scraperSignal.metadata as Prisma.InputJsonValue) ?? undefined,
        scraperName: scraperName ?? null,
        verified: true,
        scrapeAttempts: provenance?.scrapeAttempts ?? null,
        rawContentHash: provenance?.rawContentHash ?? null,
        dataOrigin: "SCRAPED",
      },
    });

    log.info("Created signal from scraper (no embedding)", {
      signalId: signal.id,
      sourceType,
      title: scraperSignal.title,
    });

    results.signalsCreated++;
    if (runId) {
      await addPipelineLog(runId, "info", `Created signal: ${scraperSignal.title}`, { url: scraperSignal.sourceUrl, signalId: signal.id });
    }

    // Trigger analysis via Inngest event
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
    return { created: true };
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

// ─── Pipeline Run Tracking ──────────────────────────────────────────────────

async function createPipelineRun(
  companyId: string,
  scraperName: string,
  sourceType: SourceType
): Promise<string> {
  const run = await prisma.pipelineRun.create({
    data: {
      companyId,
      scraperName,
      sourceType,
      status: "running",
      startedAt: new Date(),
    },
  });
  return run.id;
}

async function completePipelineRun(
  runId: string,
  signalsCreated: number,
  duplicatesSkipped: number
) {
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: "completed",
      completedAt: new Date(),
      signalsCreated,
      duplicatesSkipped,
    },
  });
}

async function failPipelineRun(runId: string, error: string) {
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: { status: "failed", completedAt: new Date(), error },
  });
}

import { Prisma } from "@prisma/client";

async function addPipelineLog(
  runId: string,
  level: "info" | "warn" | "error",
  message: string,
  details?: Record<string, unknown>
) {
  await prisma.pipelineLog.create({
    data: { 
      runId, 
      level, 
      message, 
      details: details as Prisma.InputJsonValue | undefined
    },
  });
}

export const discoveryFunctions = [discoverSignalsFunction];
