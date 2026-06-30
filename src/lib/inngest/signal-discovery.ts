/**
 * Unified signal discovery function.
 * Consolidates automated cron discovery (discovery.ts) and manual company-scoped
 * discovery (company-discovery.ts) into a single event-driven function.
 *
 * Triggered by: signal/discovery.requested
 * Supports: manual trigger from admin UI, automated cron schedule
 */

import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { SourceType } from "@prisma/client";
import { RssScraper } from "@/lib/scraping/rss-scraper";
import { FilingScraper } from "@/lib/scraping/filing-scraper";
import { GitHubScraper } from "@/lib/scraping/github-scraper";
import { CertTransparencyScraper } from "@/lib/scraping/cert-transparency-scraper";
import { RedditFinancialScraper } from "@/lib/scraping/reddit-financial-scraper";
import { MastodonScraper } from "@/lib/scraping/mastodon-scraper";
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
import { DomainTracker } from "@/lib/scraping/domain-tracker";
import { AppStoreScraper } from "@/lib/scraping/app-store-scraper";
import { ConferenceScraper } from "@/lib/scraping/conference-scraper";
import { WebSearchScraper } from "@/lib/scraping/web-search-scraper";
import { BlogScraper } from "@/lib/scraping/blog-scraper";
import { TwitterScraper } from "@/lib/scraping/twitter-scraper";
import { SocialScraper } from "@/lib/scraping/social-scraper";
import { JobPostingScraper } from "@/lib/scraping/job-scraper";
import { TranscriptScraper } from "@/lib/scraping/transcript-scraper";
import { AppStoreTracker } from "@/lib/scraping/appstore-tracker";
import { ConferenceAgendaScraper } from "@/lib/scraping/conference-agenda-scraper";
import { scrapeWithFallback } from "@/lib/scraping/adaptive-scraper";
import { generateSearchQueries, scoreRelevance, classifyContentRelevance } from "@/lib/ai/url-discovery";
import { getAllFeeds, getAllFeedsFromDB } from "@/lib/scraping/feed-registry";
import { generateRsshubFeeds } from "@/lib/scraping/rsshub-feed-generator";
import { normalizeUrl, computeContentHash } from "@/lib/scraping/url-normalizer";
import { validateAndCleanSignal, checkCompanyRelevance } from "@/lib/scraping/signal-validator";
import { logger } from "@/lib/logger";
import { generateEmbedding } from "@/lib/nlp/embedding-generator";
import { storeSignalEmbedding, findNearDuplicate } from "@/lib/nlp/embedding-store";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DiscoveryEvent {
  companyIds: string[] | "all";
  scrapers?: string[];
  mode: "manual" | "automated";
  hypothesisAware: boolean;
  stealthFallback: boolean;
}

interface DiscoveryResults {
  feedsProcessed: number;
  filingsProcessed: number;
  githubOrgsProcessed: number;
  certDomainsProcessed: number;
  redditProcessed: number;
  mastodonProcessed: number;
  pressReleasesProcessed: number;
  usptoProcessed: number;
  courtListenerProcessed: number;
  fdaProcessed: number;
  samProcessed: number;
  waybackProcessed: number;
  congressProcessed: number;
  academicProcessed: number;
  lobbyingProcessed: number;
  supplierEarningsProcessed: number;
  execAppearancesProcessed: number;
  appStoreProcessed: number;
  domainProcessed: number;
  conferenceProcessed: number;
  dynamicUrlsDiscovered: number;
  signalsCreated: number;
  duplicatesSkipped: number;
  stealthFallbackAttempts: number;
  stealthFallbackSuccesses: number;
  stealthFallbackFailures: number;
  // New scraper metrics
  blogsProcessed: number;
  twitterTimelinesProcessed: number;
  trackedSubredditsProcessed: number;
  socialProfilesProcessed: number;
  jobPostingsProcessed: number;
  transcriptsProcessed: number;
  appStoreChangesProcessed: number;
  conferenceAgendasProcessed: number;
  errors: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function resolveCompanyIds(companyIds: string[] | "all"): Promise<Array<{ id: string; name: string; slug: string; ticker: string | null; websiteUrl: string | null; sector: string | null; description: string | null; industry: string | null }>> {
  if (companyIds === "all") {
    return prisma.company.findMany({
      select: { id: true, name: true, slug: true, ticker: true, websiteUrl: true, sector: true, description: true, industry: true },
    });
  }
  return prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, name: true, slug: true, ticker: true, websiteUrl: true, sector: true, description: true, industry: true },
  });
}

function shouldRunScraper(scraperName: string, scraperFilter?: string[]): boolean {
  if (!scraperFilter || scraperFilter.length === 0) return true;
  return scraperFilter.includes(scraperName);
}

async function resolveCompanySlug(slug: string): Promise<string | null> {
  const company = await prisma.company.findFirst({
    where: { slug: { equals: slug, mode: "insensitive" } },
    select: { id: true },
  });
  if (company) return company.id;

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)) {
    const existing = await prisma.company.findUnique({ where: { id: slug }, select: { id: true } });
    if (existing) return slug;
  }
  return null;
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function extractCompanyMentions(
  text: string,
  companies: Array<{ id: string; name: string; ticker: string | null; sector: string | null; industry: string | null; description: string | null }>
): Array<{ id: string; name: string; ticker: string | null; sector: string | null; industry: string | null; description: string | null }> {
  const lowerText = text.toLowerCase();
  return companies.filter((c) => lowerText.includes(c.name.toLowerCase()));
}

// ─── Pipeline Run Tracking ──────────────────────────────────────────────────

async function createPipelineRun(companyId: string, scraperName: string, sourceType: SourceType): Promise<string> {
  const run = await prisma.pipelineRun.create({
    data: { companyId, scraperName, sourceType, status: "running", startedAt: new Date() },
  });
  return run.id;
}

async function completePipelineRun(runId: string, signalsCreated: number, duplicatesSkipped: number) {
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: { status: "completed", completedAt: new Date(), signalsCreated, duplicatesSkipped },
  });
}

async function failPipelineRun(runId: string, error: string) {
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: { status: "failed", completedAt: new Date(), error },
  });
}

async function addPipelineLog(runId: string, level: "info" | "warn" | "error", message: string, details?: Record<string, unknown>) {
  await prisma.pipelineLog.create({
    data: { runId, level, message, details: details as Prisma.InputJsonValue | undefined },
  });
}

async function applyContentGate(
  signal: { title: string; rawContent: string },
  company: { name: string; ticker: string | null; sector: string | null; industry: string | null },
  scraperName: string,
  log: ReturnType<typeof logger.child>,
  runId: string | null,
): Promise<{ passed: boolean }> {
  const fastCheck = checkCompanyRelevance({
    title: signal.title,
    rawContent: signal.rawContent,
    companyName: company.name,
    ticker: company.ticker,
    sector: company.sector,
    industry: company.industry,
  });
  if (!fastCheck.relevant) {
    log.info(`${scraperName}.content_gate.fast_rejected`, {
      company: company.name,
      reason: fastCheck.reason,
    });
    if (runId) await addPipelineLog(runId, "warn", `Content gate (fast) rejected: ${fastCheck.reason}`);
    return { passed: false };
  }
  return { passed: true };
}

// ─── Unified Discovery Function ─────────────────────────────────────────────

export const discoverSignalsUnifiedFunction = inngest.createFunction(
  {
    id: "discover-signals-unified",
    triggers: { event: "signal/discovery.requested" },
    retries: 2,
    timeouts: {
      finish: "30m",
    },
  },
  async ({ event, step }) => {
    const data = event.data as DiscoveryEvent;
    const log = logger.child({ function: "discover-signals-unified", mode: data.mode });

    if (data.mode === "automated") {
      const systemConfig = await prisma.systemConfig.findFirst();
      if (systemConfig && systemConfig.discoveryEnabled === false) {
        log.info("discovery.skip.disabled");
        return { skipped: true, reason: "Discovery disabled" };
      }
    }

    log.info("discovery.start", { companyIds: data.companyIds, scrapers: data.scrapers });

    const companies = await resolveCompanyIds(data.companyIds);
    if (companies.length === 0) {
      log.warn("discovery.no_companies");
      return { skipped: true, reason: "No companies found" };
    }

    const results: DiscoveryResults = {
      feedsProcessed: 0,
      filingsProcessed: 0,
      githubOrgsProcessed: 0,
      certDomainsProcessed: 0,
      redditProcessed: 0,
      mastodonProcessed: 0,
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
      stealthFallbackAttempts: 0,
      stealthFallbackSuccesses: 0,
      stealthFallbackFailures: 0,
      blogsProcessed: 0,
      twitterTimelinesProcessed: 0,
      trackedSubredditsProcessed: 0,
      socialProfilesProcessed: 0,
      jobPostingsProcessed: 0,
      transcriptsProcessed: 0,
      appStoreChangesProcessed: 0,
      conferenceAgendasProcessed: 0,
      errors: [],
    };

    // Step 1: RSS feeds
    if (shouldRunScraper("rss-feed", data.scrapers)) {
      await step.run("process-rss-feeds", async () => {
        const rssScraper = new RssScraper();
        const dbFeeds = await getAllFeedsFromDB();
        const feeds = dbFeeds.length > 0 ? dbFeeds : getAllFeeds();
        log.info("discovery.rss_feeds.start", { feedCount: feeds.length });

        for (const companyFeed of feeds) {
          const resolvedCompanyId = await resolveCompanySlug(companyFeed.companyId);
          if (!resolvedCompanyId) {
            if (results.errors.length < 100) results.errors.push(`Company not found: ${companyFeed.companyName}`);
            continue;
          }

          for (const feed of companyFeed.feeds) {
            let runId: string | null = null;
            let runSignalsCreated = 0;
            let runDuplicatesSkipped = 0;

            try {
              runId = await createPipelineRun(resolvedCompanyId, "rss-feed", feed.sourceType || "RSS");
              const feedData = await rssScraper.scrapeFeed(feed.url, { fetchFullArticles: true });
              if (!feedData) {
                await addPipelineLog(runId, "warn", "Failed to fetch feed", { url: feed.url });
                await completePipelineRun(runId, 0, 0);
                continue;
              }

              results.feedsProcessed++;
              for (const item of feedData.items.slice(0, 10)) {
                const beforeCreated = results.signalsCreated;
                const beforeDuplicates = results.duplicatesSkipped;
                const company = companies.find((c) => c.id === resolvedCompanyId);
                await processFeedItem(
                  item,
                  resolvedCompanyId,
                  companyFeed.companyName,
                  feed.sourceType || "RSS",
                  results,
                  runId,
                  feed.label,
                  rssScraper.getProvenance(),
                  rssScraper.scraperName,
                  company ? { name: company.name, ticker: company.ticker, description: company.description, sector: company.sector, industry: company.industry } : undefined
                );
                runSignalsCreated += results.signalsCreated - beforeCreated;
                runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
              }
              await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
            } catch (error) {
              if (results.errors.length < 100) results.errors.push(`RSS feed error: ${String(error)}`);
              if (runId) await failPipelineRun(runId, String(error));
            }
          }
        }

        // Step 1.1: RSSHub feeds (dynamic, ticker-aware)
        log.info("discovery.rsshub_feeds.start", { companyCount: companies.length });
        const rsshubFeedsProcessed = new Set<string>(); // Dedup global feeds across companies

        for (const company of companies) {
          const rsshubFeeds = generateRsshubFeeds({
            name: company.name,
            ticker: company.ticker,
            sector: company.sector,
            slug: company.slug,
          });

          for (const feed of rsshubFeeds) {
            // Skip if we've already processed this global feed for another company
            if (rsshubFeedsProcessed.has(feed.url)) {
              continue;
            }
            rsshubFeedsProcessed.add(feed.url);

            const resolvedCompanyId = company.id;
            let runId: string | null = null;
            let runSignalsCreated = 0;
            let runDuplicatesSkipped = 0;

            try {
              runId = await createPipelineRun(resolvedCompanyId, "rsshub-feed", feed.sourceType || "NEWS");
              const feedData = await rssScraper.scrapeFeed(feed.url, { fetchFullArticles: true });
              
              if (!feedData) {
                await addPipelineLog(runId, "warn", "Failed to fetch RSSHub feed", { url: feed.url });
                await completePipelineRun(runId, 0, 0);
                continue;
              }

              results.feedsProcessed++;
              for (const item of feedData.items.slice(0, 10)) {
                const beforeCreated = results.signalsCreated;
                const beforeDuplicates = results.duplicatesSkipped;
                await processFeedItem(
                  item,
                  resolvedCompanyId,
                  company.name,
                  feed.sourceType || "NEWS",
                  results,
                  runId,
                  feed.label,
                  rssScraper.getProvenance(),
                  rssScraper.scraperName,
                  { name: company.name, ticker: company.ticker, description: company.description, sector: company.sector, industry: company.industry }
                );
                runSignalsCreated += results.signalsCreated - beforeCreated;
                runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
              }
              await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
            } catch (error) {
              if (results.errors.length < 100) results.errors.push(`RSSHub feed error: ${String(error)}`);
              if (runId) await failPipelineRun(runId, String(error));
            }
          }
        }
      });
    }

// Step 1.3: Blog post scraping (from CompanyDataSource BLOG records)
    if (shouldRunScraper("blog", data.scrapers)) {
      await step.run("process-blog-posts", async () => {
        const blogScraper = new BlogScraper();
        const blogDataSources = await prisma.companyDataSource.findMany({
          where: { sourceType: "BLOG", isActive: true },
          include: { company: { select: { id: true, name: true, ticker: true, description: true, sector: true, industry: true } } },
        });

        log.info("discovery.blog.start", { blogCount: blogDataSources.length });

        for (const ds of blogDataSources) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(ds.companyId, "blog", "BLOG");

            // First, try to extract post URLs from the blog index page
            const postUrls = await blogScraper.extractPostUrls(ds.url, 10);

            if (postUrls.length === 0) {
              log.info("discovery.blog.no_posts_found", { url: ds.url, companyId: ds.companyId });
              await completePipelineRun(runId, 0, 0);
              continue;
            }

            results.blogsProcessed++;
            const company = companies.find((c) => c.id === ds.companyId);
            const companyInfo = company ? { name: company.name, ticker: company.ticker, description: company.description, sector: company.sector, industry: company.industry } : undefined;

            for (const postUrl of postUrls) {
              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;

              try {
                const article = await blogScraper.scrapeArticle(postUrl);
                if (!article || !article.bodyText || article.bodyText.length < 100) {
                  continue;
                }

                // Content gate
                if (companyInfo) {
                  const fastCheck = checkCompanyRelevance({
                    title: article.title,
                    rawContent: article.bodyText,
                    companyName: companyInfo.name,
                    ticker: companyInfo.ticker,
                    sector: companyInfo.sector,
                    industry: companyInfo.industry,
                  });
                  if (!fastCheck.relevant) {
                    log.info("blog.content_gate.fast_rejected", { url: postUrl, company: companyInfo.name, reason: fastCheck.reason });
                    continue;
                  }
                }

                await createSignalFromScraper(
                  {
                    sourceUrl: postUrl,
                    title: article.title || ds.url,
                    rawContent: article.bodyText,
                    publishedAt: article.publishedAt,
                    author: article.author || undefined,
                    metadata: article.metadata,
                  },
                  ds.companyId,
                  "BLOG",
                  results,
                  runId,
                  blogScraper.getProvenance(),
                  blogScraper.scraperName
                );
                runSignalsCreated += results.signalsCreated - beforeCreated;
                runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
              } catch (postError) {
                log.warn("discovery.blog.post_error", { url: postUrl, error: String(postError) });
              }
            }

            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`Blog error for ${ds.url}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

// Step 1.5: Stealth fallback
    if (data.stealthFallback && shouldRunScraper("stealth-fallback", data.scrapers)) {
      await step.run("stealth-fallback-rescrape", async () => {
        const blogScraper = new BlogScraper();
        const lowQualitySignals = await prisma.signal.findMany({
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 20,
        });
        const needsRescrape = lowQualitySignals.filter((s) => s.rawContent && s.rawContent.length < 500);

        if (needsRescrape.length === 0) {
          log.info("discovery.stealth_fallback.no_signals_needed");
          return;
        }

        for (const signal of needsRescrape) {
          try {
            results.stealthFallbackAttempts++;
            const fastScrape = async (url: string) => blogScraper.scrapeArticle(url);
            const result = await scrapeWithFallback(signal.sourceUrl, fastScrape);

            if (result.method === "stealth" && result.article) {
              await prisma.signal.update({
                where: { id: signal.id },
                data: {
                  rawContent: result.article.bodyText,
                  title: result.article.title || signal.title,
                  author: result.article.author || signal.author,
                  publishedAt: result.article.publishedAt || signal.publishedAt,
                  scraperName: "stealth-browser",
                },
              });
              results.stealthFallbackSuccesses++;
            } else {
              results.stealthFallbackFailures++;
            }
          } catch {
            results.stealthFallbackFailures++;
          }
        }
      });
    }

    // Step 2: SEC filings
    if (shouldRunScraper("sec-filing", data.scrapers)) {
      await step.run("process-sec-filings", async () => {
        const filingScraper = new FilingScraper();
        const companiesWithTickers = companies.filter((c) => c.ticker !== null);

        for (const company of companiesWithTickers) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "sec-filing", "FILING");
            const filingData = await filingScraper.scrapeFilingsByCompanyName(company.name);
            if (!filingData) {
              await completePipelineRun(runId, 0, 0);
              continue;
            }

            results.filingsProcessed++;
            for (const filing of filingData.filings.slice(0, 5)) {
              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;
              await processFiling(filing, company.id, company.name, results, runId, filingScraper.getProvenance(), filingScraper.scraperName);
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }
            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`SEC filing error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 3: GitHub
    if (shouldRunScraper("github", data.scrapers)) {
      await step.run("process-github-activity", async () => {
        const githubScraper = new GitHubScraper();
        const companiesWithWebsite = companies.filter((c) => c.websiteUrl !== null);

        for (const company of companiesWithWebsite) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "github", "TECH_SIGNAL");
            const domain = extractDomain(company.websiteUrl || "");
            const orgName = domain.split(".")[0];
            const signals = await githubScraper.scrape(orgName, process.env.GITHUB_TOKEN);

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
            if (results.errors.length < 100) results.errors.push(`GitHub error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 4: Certificate transparency
    if (shouldRunScraper("cert-transparency", data.scrapers)) {
      await step.run("process-cert-transparency", async () => {
        const certScraper = new CertTransparencyScraper();
        const companiesWithWebsite = companies.filter((c) => c.websiteUrl !== null);

        for (const company of companiesWithWebsite) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "cert-transparency", "TECH_SIGNAL");
            const domain = extractDomain(company.websiteUrl || "");
            const signals = await certScraper.scrape(domain);

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
            if (results.errors.length < 100) results.errors.push(`Cert transparency error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 5: Reddit
    if (shouldRunScraper("reddit-financial", data.scrapers)) {
      await step.run("process-reddit-financial", async () => {
        const redditScraper = new RedditFinancialScraper();
        const companiesWithTickers = companies.filter((c) => c.ticker !== null);
        const tickers = companiesWithTickers.map((c) => c.ticker!).filter((t): t is string => t !== null);
        const signals = await redditScraper.scrape(tickers);

        const companyRuns = new Map<string, { runId: string; signalsCreated: number; duplicatesSkipped: number }>();

        for (const signal of signals.slice(0, 20)) {
          const textToSearch = signal.title + " " + signal.bodyText;
          const mentionedCompanies = extractCompanyMentions(textToSearch, companies);

          if (mentionedCompanies.length === 0) continue;

          for (const company of mentionedCompanies) {
            // Two-stage content gate
            const fastCheck = checkCompanyRelevance({
              title: signal.title,
              rawContent: signal.bodyText,
              companyName: company.name,
              ticker: company.ticker,
              sector: company.sector,
              industry: company.industry,
            });
            if (!fastCheck.relevant) {
              log.info("reddit.content_gate.fast_rejected", {
                url: signal.url,
                company: company.name,
                reason: fastCheck.reason,
              });
              continue;
            }

            const llmCheck = await classifyContentRelevance(
              signal.title,
              signal.bodyText,
              { name: company.name, ticker: company.ticker, description: company.description }
            );
            if (!llmCheck.relevant) {
              log.info("reddit.content_gate.llm_rejected", {
                url: signal.url,
                company: company.name,
                confidence: llmCheck.confidence,
                reasoning: llmCheck.reasoning,
              });
              continue;
            }

            if (!companyRuns.has(company.id)) {
              const runId = await createPipelineRun(company.id, "reddit-financial", "SOCIAL");
              companyRuns.set(company.id, { runId, signalsCreated: 0, duplicatesSkipped: 0 });
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

        for (const [, runData] of companyRuns) {
          await completePipelineRun(runData.runId, runData.signalsCreated, runData.duplicatesSkipped);
        }
        results.redditProcessed = 1;
      });
    }

    // Step 5.5: Tracked subreddits
    if (shouldRunScraper("tracked-subreddit", data.scrapers)) {
      await step.run("process-tracked-subreddits", async () => {
        const rssScraper = new RssScraper();
        const trackedSubreddits = await prisma.trackedSubreddit.findMany({
          where: { isActive: true },
          include: { company: { select: { id: true, name: true, ticker: true, description: true, sector: true, industry: true } } },
        });

        log.info("discovery.tracked_subreddits.start", { count: trackedSubreddits.length });

        for (const tracked of trackedSubreddits) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(tracked.companyId, "tracked-subreddit", "SOCIAL");
            const feedUrl = `https://www.reddit.com/r/${tracked.subreddit}/.rss`;
            const feedData = await rssScraper.scrapeFeed(feedUrl, { fetchFullArticles: true });

            if (!feedData) {
              await completePipelineRun(runId, 0, 0);
              continue;
            }

            results.trackedSubredditsProcessed++;
            const company = companies.find((c) => c.id === tracked.companyId);
            const companyInfo = company ? { name: company.name, ticker: company.ticker, description: company.description, sector: company.sector, industry: company.industry } : undefined;

            for (const item of feedData.items.slice(0, 10)) {
              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;

              await processFeedItem(
                item,
                tracked.companyId,
                tracked.company.name,
                "SOCIAL",
                results,
                runId,
                `r/${tracked.subreddit}`,
                rssScraper.getProvenance(),
                rssScraper.scraperName,
                companyInfo
              );
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }

            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`Tracked subreddit error for r/${tracked.subreddit}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 5.7: Twitter timeline
    if (shouldRunScraper("twitter", data.scrapers)) {
      await step.run("process-twitter-timelines", async () => {
        const twitterScraper = new TwitterScraper();
        const twitterDataSources = await prisma.companyDataSource.findMany({
          where: {
            sourceType: "SOCIAL",
            isActive: true,
            url: { contains: "twitter.com" },
          },
          include: { company: { select: { id: true, name: true, ticker: true, description: true, sector: true, industry: true } } },
        });

        // Also check for x.com URLs
        const xDataSources = await prisma.companyDataSource.findMany({
          where: {
            sourceType: "SOCIAL",
            isActive: true,
            url: { contains: "x.com" },
          },
          include: { company: { select: { id: true, name: true, ticker: true, description: true, sector: true, industry: true } } },
        });

        const allTwitterDataSources = [...twitterDataSources, ...xDataSources];
        log.info("discovery.twitter.start", { count: allTwitterDataSources.length });

        for (const ds of allTwitterDataSources) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(ds.companyId, "twitter", "SOCIAL");

            // Extract Twitter handle from URL
            const handleMatch = ds.url.match(/(?:twitter\.com|x\.com)\/([^\/\?]+)/);
            if (!handleMatch) {
              await completePipelineRun(runId, 0, 0);
              continue;
            }

            const handle = handleMatch[1];
            const timelineItems = await twitterScraper.scrapeUserTimeline(handle, 20);

            if (timelineItems.length === 0) {
              await completePipelineRun(runId, 0, 0);
              continue;
            }

            results.twitterTimelinesProcessed++;
            const company = companies.find((c) => c.id === ds.companyId);
            const companyInfo = company ? { name: company.name, ticker: company.ticker, description: company.description, sector: company.sector, industry: company.industry } : undefined;

            for (const tweet of timelineItems) {
              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;

              // Content gate
              if (companyInfo) {
                const fastCheck = checkCompanyRelevance({
                  title: tweet.bodyText.slice(0, 200),
                  rawContent: tweet.bodyText,
                  companyName: companyInfo.name,
                  ticker: companyInfo.ticker,
                  sector: companyInfo.sector,
                  industry: companyInfo.industry,
                });
                if (!fastCheck.relevant) {
                  continue;
                }
              }

              await createSignalFromScraper(
                {
                  sourceUrl: tweet.url,
                  title: tweet.bodyText.slice(0, 200),
                  rawContent: tweet.bodyText,
                  publishedAt: tweet.publishedAt,
                  author: tweet.author,
                },
                ds.companyId,
                "SOCIAL",
                results,
                runId,
                twitterScraper.getProvenance(),
                twitterScraper.scraperName
              );
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }

            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`Twitter error for ${ds.url}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 5.8: Social profiles (non-Twitter/Reddit/Mastodon)
    if (shouldRunScraper("social-profile", data.scrapers)) {
      await step.run("process-social-profiles", async () => {
        // Load social data sources that aren't Twitter, Reddit, or Mastodon (already handled)
        const socialDataSources = await prisma.companyDataSource.findMany({
          where: {
            sourceType: "SOCIAL",
            isActive: true,
            AND: [
              { url: { not: { contains: "twitter.com" } } },
              { url: { not: { contains: "x.com" } } },
              { url: { not: { contains: "reddit.com" } } },
              { url: { not: { contains: "mastodon" } } },
            ],
          },
          include: { company: { select: { id: true, name: true, ticker: true, description: true, sector: true, industry: true } } },
        });

        log.info("discovery.social_profiles.start", { count: socialDataSources.length });

        for (const ds of socialDataSources) {
          let runId: string | null = null;
          const runSignalsCreated = 0;
          const runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(ds.companyId, "social-profile", "SOCIAL");

            // For LinkedIn/Facebook, we can't reliably scrape public posts without auth
            // Skip these gracefully and log for future enhancement
            const parsed = new URL(ds.url);
            const isLinkedIn = parsed.hostname.includes("linkedin.com");
            const isFacebook = parsed.hostname.includes("facebook.com");

            if (isLinkedIn || isFacebook) {
              log.info("discovery.social_profiles.skipped_auth_required", {
                url: ds.url,
                platform: isLinkedIn ? "linkedin" : "facebook",
              });
              await completePipelineRun(runId, 0, 0);
              continue;
            }

            // For other social profiles (Hacker News, etc.), try to scrape
            // Note: SocialScraper.scrapePost() is for individual posts, not profile feeds
            // We'll create a signal noting the profile was discovered but not scraped
            // Full profile scraping would require platform-specific implementations

            results.socialProfilesProcessed++;
            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`Social profile error for ${ds.url}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 6: Mastodon
    if (shouldRunScraper("mastodon-social", data.scrapers)) {
      await step.run("process-mastodon-social", async () => {
        const mastodonScraper = new MastodonScraper();
        const companiesWithTickers = companies.filter((c) => c.ticker !== null);
        const tickers = companiesWithTickers.map((c) => c.ticker!).filter((t): t is string => t !== null);
        const signals = await mastodonScraper.scrape(tickers);

        const companyRuns = new Map<string, { runId: string; signalsCreated: number; duplicatesSkipped: number }>();

        for (const signal of signals.slice(0, 20)) {
          const textToSearch = signal.bodyText + " " + ((signal.metadata as Record<string, string>)?.authorAcct || "");
          const mentionedCompanies = extractCompanyMentions(textToSearch, companies);

          if (mentionedCompanies.length === 0) continue;

          for (const company of mentionedCompanies) {
            // Two-stage content gate
            const fastCheck = checkCompanyRelevance({
              title: signal.bodyText.slice(0, 200),
              rawContent: signal.bodyText,
              companyName: company.name,
              ticker: company.ticker,
              sector: company.sector,
              industry: company.industry,
            });
            if (!fastCheck.relevant) {
              log.info("mastodon.content_gate.fast_rejected", {
                url: signal.url,
                company: company.name,
                reason: fastCheck.reason,
              });
              continue;
            }

            const llmCheck = await classifyContentRelevance(
              signal.bodyText.slice(0, 200),
              signal.bodyText,
              { name: company.name, ticker: company.ticker, description: company.description }
            );
            if (!llmCheck.relevant) {
              log.info("mastodon.content_gate.llm_rejected", {
                url: signal.url,
                company: company.name,
                confidence: llmCheck.confidence,
                reasoning: llmCheck.reasoning,
              });
              continue;
            }

            if (!companyRuns.has(company.id)) {
              const runId = await createPipelineRun(company.id, "mastodon-social", "SOCIAL");
              companyRuns.set(company.id, { runId, signalsCreated: 0, duplicatesSkipped: 0 });
            }

            const runData = companyRuns.get(company.id)!;
            const beforeCreated = results.signalsCreated;
            const beforeDuplicates = results.duplicatesSkipped;

            const mapped = {
              sourceUrl: signal.url,
              title: signal.bodyText.slice(0, 200),
              rawContent: signal.bodyText,
              publishedAt: signal.publishedAt,
              engagement: signal.engagement,
              author: signal.author ?? undefined,
              metadata: (signal.metadata as Record<string, unknown>) ?? undefined,
            };
            await createSignalFromScraper(mapped, company.id, "SOCIAL", results, runData.runId, mastodonScraper.getProvenance(), mastodonScraper.scraperName);

            runData.signalsCreated += results.signalsCreated - beforeCreated;
            runData.duplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
          }
        }

        for (const [, runData] of companyRuns) {
          await completePipelineRun(runData.runId, runData.signalsCreated, runData.duplicatesSkipped);
        }
        results.mastodonProcessed = 1;
      });
    }

    // Step 7: Press releases
    if (shouldRunScraper("press-release", data.scrapers)) {
      await step.run("process-press-releases", async () => {
        const pressScraper = new PressReleaseScraper();
        const signals = await pressScraper.scrape();

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
            // Two-stage content gate
            const fastCheck = checkCompanyRelevance({
              title: signal.title,
              rawContent: signal.bodyText,
              companyName: company.name,
              ticker: company.ticker,
              sector: company.sector,
              industry: company.industry,
            });
            if (!fastCheck.relevant) {
              log.info("press_release.content_gate.fast_rejected", {
                url: signal.url,
                company: company.name,
                reason: fastCheck.reason,
              });
              continue;
            }

            const llmCheck = await classifyContentRelevance(
              signal.title,
              signal.bodyText,
              { name: company.name, ticker: company.ticker, description: company.description }
            );
            if (!llmCheck.relevant) {
              log.info("press_release.content_gate.llm_rejected", {
                url: signal.url,
                company: company.name,
                confidence: llmCheck.confidence,
                reasoning: llmCheck.reasoning,
              });
              continue;
            }

            if (!companyRuns.has(company.id)) {
              const runId = await createPipelineRun(company.id, "press-release", "PRESS_RELEASE");
              companyRuns.set(company.id, { runId, signalsCreated: 0, duplicatesSkipped: 0 });
            }

            const runData = companyRuns.get(company.id)!;
            const beforeCreated = results.signalsCreated;
            const beforeDuplicates = results.duplicatesSkipped;

            await createSignalFromScraper(mapped, company.id, "PRESS_RELEASE", results, runData.runId, pressScraper.getProvenance(), pressScraper.scraperName);

            runData.signalsCreated += results.signalsCreated - beforeCreated;
            runData.duplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
          }
        }

        for (const [, runData] of companyRuns) {
          await completePipelineRun(runData.runId, runData.signalsCreated, runData.duplicatesSkipped);
        }
        results.pressReleasesProcessed = 1;
      });
    }

    // Step 8: USPTO
    if (shouldRunScraper("uspto", data.scrapers)) {
      await step.run("process-uspto-patents", async () => {
        const usptoScraper = new UspScraper();
        if (!usptoScraper.isConfigured) {
          log.info("discovery.uspto.skipped", { reason: "API key not configured" });
          return;
        }

        for (const company of companies.slice(0, 10)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "uspto", "PATENT");
            const signals = await usptoScraper.scrapeByAssignee(company.name, 5);

            for (const signal of signals) {
              const gate = await applyContentGate(signal, company, "uspto", log, runId);
              if (!gate.passed) continue;

              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;
              await createSignalFromScraper(signal, company.id, "PATENT", results, runId, usptoScraper.getProvenance(), usptoScraper.scraperName);
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }
            results.usptoProcessed++;
            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`USPTO error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 9: CourtListener
    if (shouldRunScraper("courtlistener", data.scrapers)) {
      await step.run("process-courtlistener", async () => {
        const courtScraper = new CourtListenerScraper();
        if (!courtScraper.isConfigured) {
          log.info("discovery.courtlistener.skipped", { reason: "API key not configured" });
          return;
        }

        for (const company of companies.slice(0, 10)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "courtlistener", "LITIGATION");
            const signals = await courtScraper.scrapeByPartyName(company.name, 5);

            for (const signal of signals) {
              const gate = await applyContentGate(signal, company, "courtlistener", log, runId);
              if (!gate.passed) continue;

              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;
              await createSignalFromScraper(signal, company.id, "LITIGATION", results, runId, courtScraper.getProvenance(), courtScraper.scraperName);
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }
            results.courtListenerProcessed++;
            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`CourtListener error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 10: FDA
    if (shouldRunScraper("fda", data.scrapers)) {
      await step.run("process-fda", async () => {
        const fdaScraper = new FdaScraper();
        const pharmaCompanies = companies.filter(
          (c) => c.ticker !== null || c.name.toLowerCase().includes("pharma")
        );

        for (const company of pharmaCompanies.slice(0, 10)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "fda", "FDA");

            const drugSignals = await fdaScraper.scrapeDrugEvents(company.name, 5);
            for (const signal of drugSignals) {
              const gate = await applyContentGate(signal, company, "fda", log, runId);
              if (!gate.passed) continue;

              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;
              await createSignalFromScraper(signal, company.id, "FDA", results, runId, fdaScraper.getProvenance(), fdaScraper.scraperName);
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }

            const deviceSignals = await fdaScraper.scrapeDeviceClearances(company.name, 5);
            for (const signal of deviceSignals) {
              const gate = await applyContentGate(signal, company, "fda", log, runId);
              if (!gate.passed) continue;

              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;
              await createSignalFromScraper(signal, company.id, "FDA", results, runId, fdaScraper.getProvenance(), fdaScraper.scraperName);
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }
            results.fdaProcessed++;
            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`FDA error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 11: SAM.gov
    if (shouldRunScraper("sam", data.scrapers)) {
      await step.run("process-sam-contracts", async () => {
        const samScraper = new SamScraper();
        if (!samScraper.isConfigured) {
          log.info("discovery.sam.skipped", { reason: "API key not configured" });
          return;
        }

        for (const company of companies.slice(0, 10)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "sam", "CONTRACT");
            const signals = await samScraper.scrapeByVendorName(company.name, 5);

            for (const signal of signals) {
              const gate = await applyContentGate(signal, company, "sam", log, runId);
              if (!gate.passed) continue;

              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;
              await createSignalFromScraper(signal, company.id, "CONTRACT", results, runId, samScraper.getProvenance(), samScraper.scraperName);
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }
            results.samProcessed++;
            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`SAM error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 12: Wayback Machine
    if (shouldRunScraper("wayback", data.scrapers)) {
      await step.run("process-wayback-changes", async () => {
        const waybackScraper = new WaybackScraper();
        const companiesWithWebsite = companies.filter((c) => c.websiteUrl !== null);

        for (const company of companiesWithWebsite.slice(0, 10)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "wayback", "WEB_ARCHIVE");
            const domain = extractDomain(company.websiteUrl || "");
            const signals = await waybackScraper.scrapeDomainChanges(domain, 10);

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
            if (results.errors.length < 100) results.errors.push(`Wayback error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 13: Congress
    if (shouldRunScraper("congress", data.scrapers)) {
      await step.run("process-congress-legislation", async () => {
        const congressScraper = new CongressScraper();
        if (!congressScraper.isConfigured()) {
          log.info("discovery.congress.skipped", { reason: "API key not configured" });
          return;
        }

        for (const company of companies.slice(0, 10)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "congress", "LEGISLATION");
            const signals = await congressScraper.scrape(company.name, { limit: 5 });

            for (const signal of signals) {
              const mapped = {
                sourceUrl: signal.url,
                title: signal.title,
                rawContent: signal.summary,
                publishedAt: signal.publishedAt,
              };

              // Fast gate
              const fastGate = await applyContentGate(mapped, company, "congress", log, runId);
              if (!fastGate.passed) continue;

              // LLM gate
              const llmCheck = await classifyContentRelevance(
                mapped.title,
                mapped.rawContent,
                { name: company.name, ticker: company.ticker, description: company.description }
              );
              if (!llmCheck.relevant) {
                log.info("congress.content_gate.llm_rejected", {
                  company: company.name,
                  confidence: llmCheck.confidence,
                  reasoning: llmCheck.reasoning,
                });
                if (runId) await addPipelineLog(runId, "warn", `Content gate (LLM) rejected: confidence=${llmCheck.confidence}`);
                continue;
              }

              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;
              await createSignalFromScraper(mapped, company.id, "LEGISLATION", results, runId, congressScraper.getProvenance(), congressScraper.scraperName);
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }
            results.congressProcessed++;
            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`Congress error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 14: Academic papers
    if (shouldRunScraper("academic", data.scrapers)) {
      await step.run("process-academic-papers", async () => {
        const academicScraper = new AcademicScraper();
        const researchCompanies = companies.filter(
          (c) => c.ticker !== null || c.name.toLowerCase().includes("labs")
        );

        for (const company of researchCompanies.slice(0, 10)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "academic", "ACADEMIC");
            // Disambiguate short/common-word company names to avoid false matches
            // (e.g., "Apple" the fruit vs Apple Inc, "Shell" the word vs Shell plc)
            const academicQuery = company.name.length <= 5 && company.ticker
              ? `${company.name} ${company.ticker} technology`
              : `${company.name} Inc technology`;
            const signals = await academicScraper.scrape({ query: academicQuery, limit: 5 });

            for (const signal of signals) {
              const mapped = {
                sourceUrl: signal.url,
                title: signal.title,
                rawContent: signal.abstract,
                publishedAt: signal.publishedAt,
              };

              // Fast gate
              const fastCheck = checkCompanyRelevance({
                title: mapped.title,
                rawContent: mapped.rawContent,
                companyName: company.name,
                ticker: company.ticker,
                sector: company.sector,
                industry: company.industry,
              });

              if (!fastCheck.relevant) {
                // LLM fallback: academic papers often use informal name variants
                const llmCheck = await classifyContentRelevance(
                  mapped.title,
                  mapped.rawContent,
                  { name: company.name, ticker: company.ticker, description: company.description }
                );
                if (!llmCheck.relevant) {
                  log.info("academic.content_gate.llm_rejected", {
                    url: mapped.sourceUrl,
                    company: company.name,
                    confidence: llmCheck.confidence,
                    reason: llmCheck.reasoning,
                  });
                  if (runId)
                    await addPipelineLog(runId, "warn", `Content gate (LLM) rejected: ${llmCheck.reasoning}`, { url: mapped.sourceUrl });
                  continue;
                }
                // LLM says relevant despite fast gate failure — proceed
                log.info("academic.content_gate.fast_rejected_but_llm_passed", {
                  url: mapped.sourceUrl,
                  company: company.name,
                  fastReason: fastCheck.reason,
                });
              }

              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;
              await createSignalFromScraper(mapped, company.id, "ACADEMIC", results, runId, academicScraper.getProvenance(), academicScraper.scraperName);
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }
            results.academicProcessed++;
            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`Academic error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 15: Lobbying
    if (shouldRunScraper("lobbying", data.scrapers)) {
      await step.run("process-lobbying-disclosures", async () => {
        const lobbyingScraper = new LobbyingScraper();
        const companiesWithTickers = companies.filter((c) => c.ticker !== null);

        for (const company of companiesWithTickers.slice(0, 10)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "lobbying", "LOBBYING");
            const disclosures = await lobbyingScraper.scrapeLobbying(company.name);

            if (disclosures) {
              for (const disclosure of disclosures.slice(0, 5)) {
                const lobbyingSignal = {
                  title: `${company.name} Lobbying: ${disclosure.issue}`,
                  rawContent: `${disclosure.registrant} filed lobbying disclosure for ${disclosure.issue}. Amount: ${disclosure.amount ?? "N/A"}. Period: ${disclosure.period}`,
                };

                const gate = await applyContentGate(lobbyingSignal, company, "lobbying", log, runId);
                if (!gate.passed) continue;

                const beforeCreated = results.signalsCreated;
                const beforeDuplicates = results.duplicatesSkipped;
                await createSignalFromScraper(
                  {
                    sourceUrl: disclosure.url,
                    ...lobbyingSignal,
                    publishedAt: disclosure.filedAt,
                  },
                  company.id,
                  "LOBBYING",
                  results,
                  runId,
                  lobbyingScraper.getProvenance(),
                  lobbyingScraper.scraperName
                );
                runSignalsCreated += results.signalsCreated - beforeCreated;
                runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
              }
            }
            results.lobbyingProcessed++;
            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`Lobbying error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 16: Supplier earnings
    if (shouldRunScraper("supplier-earnings", data.scrapers)) {
      await step.run("process-supplier-earnings", async () => {
        const supplierScraper = new SupplierEarningScraper();
        const companiesWithTickers = companies.filter((c) => c.ticker !== null);

        for (const company of companiesWithTickers.slice(0, 10)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "supplier-earnings", "TRANSCRIPT");
            const earnings = await supplierScraper.scrapeEarnings(company.name);

            if (earnings) {
              for (const earning of earnings.slice(0, 5)) {
                const beforeCreated = results.signalsCreated;
                const beforeDuplicates = results.duplicatesSkipped;
                await createSignalFromScraper(
                  {
                    sourceUrl: earning.url,
                    title: `${earning.supplier} Q${earning.quarter} ${earning.year} - ${company.name} References`,
                    rawContent: `Supplier ${earning.supplier} earnings report. Customer mentions: ${earning.customerMentions.map((m) => `${m.customer} (${m.sentiment})`).join(", ")}. Guidance: ${earning.revenueGuidance ?? "N/A"}`,
                    publishedAt: earning.publishedAt,
                  },
                  company.id,
                  "TRANSCRIPT",
                  results,
                  runId,
                  supplierScraper.getProvenance(),
                  supplierScraper.scraperName
                );
                runSignalsCreated += results.signalsCreated - beforeCreated;
                runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
              }
            }
            results.supplierEarningsProcessed++;
            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`Supplier earnings error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 17: Executive appearances
    if (shouldRunScraper("exec-appearances", data.scrapers)) {
      await step.run("process-executive-appearances", async () => {
        const execScraper = new ExecutiveAppearanceScraper();
        const companiesWithTickers = companies.filter((c) => c.ticker !== null);

        for (const company of companiesWithTickers.slice(0, 10)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "exec-appearances", "CONFERENCE");
            const appearances = await execScraper.scrapeAppearances(company.name);

            if (appearances) {
              for (const appearance of appearances.slice(0, 5)) {
                const execSignal = {
                  title: appearance.title,
                  rawContent: `${appearance.executive} at ${appearance.event}: ${appearance.summary}`,
                };

                const gate = await applyContentGate(execSignal, company, "exec_appearances", log, runId);
                if (!gate.passed) continue;

                const beforeCreated = results.signalsCreated;
                const beforeDuplicates = results.duplicatesSkipped;
                await createSignalFromScraper(
                  {
                    sourceUrl: appearance.url,
                    ...execSignal,
                    publishedAt: appearance.publishedAt,
                  },
                  company.id,
                  "CONFERENCE",
                  results,
                  runId,
                  execScraper.getProvenance(),
                  execScraper.scraperName
                );
                runSignalsCreated += results.signalsCreated - beforeCreated;
                runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
              }
            }
            results.execAppearancesProcessed++;
            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`Exec appearances error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 18: App Store
    if (shouldRunScraper("app-store", data.scrapers)) {
      await step.run("process-app-store-rss", async () => {
        const appStoreScraper = new AppStoreScraper();
        const companiesWithTickers = companies.filter((c) => c.ticker !== null);

        for (const company of companiesWithTickers.slice(0, 10)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "app-store", "TECH_SIGNAL");
            const signals = await appStoreScraper.scrape(company.name);

            for (const signal of signals.slice(0, 10)) {
              const mapped = {
                sourceUrl: signal.url,
                title: signal.title,
                rawContent: signal.description,
                publishedAt: signal.publishedAt,
              };

              const gate = await applyContentGate(mapped, company, "app_store", log, runId);
              if (!gate.passed) continue;

              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;
              await createSignalFromScraper(mapped, company.id, "TECH_SIGNAL", results, runId, appStoreScraper.getProvenance(), appStoreScraper.scraperName);
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }
            results.appStoreProcessed++;
            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`App Store error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 19: Conference agendas
    if (shouldRunScraper("conference", data.scrapers)) {
      await step.run("process-conference-agendas", async () => {
        const conferenceScraper = new ConferenceScraper();
        const companiesWithTickers = companies.filter((c) => c.ticker !== null);

        for (const company of companiesWithTickers.slice(0, 10)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "conference", "CONFERENCE");
            const signals = await conferenceScraper.scrape(company.name);

            for (const signal of signals.slice(0, 10)) {
              const mapped = {
                sourceUrl: signal.url,
                title: signal.title,
                rawContent: signal.description,
                publishedAt: signal.publishedAt,
              };

              const gate = await applyContentGate(mapped, company, "conference", log, runId);
              if (!gate.passed) continue;

              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;
              await createSignalFromScraper(mapped, company.id, "CONFERENCE", results, runId, conferenceScraper.getProvenance(), conferenceScraper.scraperName);
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }
            results.conferenceProcessed++;
            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`Conference error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 20: Domain registrations
    if (shouldRunScraper("domain-tracker", data.scrapers)) {
      await step.run("process-domain-registrations", async () => {
        const domainTracker = new DomainTracker();
        const companiesWithTickers = companies.filter((c) => c.ticker !== null);

        for (const company of companiesWithTickers.slice(0, 10)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "domain-tracker", "TECH_SIGNAL");
            const registrations = await domainTracker.scrapeDomains(company.name);

            if (registrations) {
              for (const reg of registrations.slice(0, 5)) {
                const domainSignal = {
                  title: `${company.name} registered ${reg.domain}`,
                  rawContent: `Domain ${reg.domain} registered by ${reg.registrant} via ${reg.registrar}`,
                };

                const gate = await applyContentGate(domainSignal, company, "domain_tracker", log, runId);
                if (!gate.passed) continue;

                const beforeCreated = results.signalsCreated;
                const beforeDuplicates = results.duplicatesSkipped;
                await createSignalFromScraper(
                  {
                    sourceUrl: reg.url,
                    ...domainSignal,
                    publishedAt: reg.registeredAt,
                  },
                  company.id,
                  "TECH_SIGNAL",
                  results,
                  runId,
                  domainTracker.getProvenance(),
                  domainTracker.scraperName
                );
                runSignalsCreated += results.signalsCreated - beforeCreated;
                runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
              }
            }
            results.domainProcessed++;
            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`Domain tracker error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 21: Dynamic URL discovery
    if (data.hypothesisAware && shouldRunScraper("web-search", data.scrapers)) {
      await step.run("discover-urls-dynamic", async () => {
        const webSearchScraper = new WebSearchScraper();
        const companiesWithSignals = await prisma.company.findMany({
          where: { signals: { some: {} } },
          select: { id: true, name: true, ticker: true, description: true, websiteUrl: true, slug: true, industry: true, sector: true, createdAt: true, updatedAt: true },
          take: 10,
        });

        let totalQueries = 0;
        const MAX_TOTAL_QUERIES = 30;
        const MAX_QUERIES_PER_COMPANY = 3;

        for (const company of companiesWithSignals) {
          if (totalQueries >= MAX_TOTAL_QUERIES) break;

          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "web-search", "NEWS");

            const hypotheses = await prisma.companyHypothesis.findMany({
              where: { companyId: company.id, status: "ACTIVE" },
            });
            const themes = await prisma.signalTheme.findMany({
              where: { companyId: company.id },
              orderBy: { momentum: "desc" },
              take: 10,
            });

            const queries = await generateSearchQueries(company, hypotheses, themes);
            const topQueries = queries.sort((a, b) => b.priority - a.priority).slice(0, MAX_QUERIES_PER_COMPANY);

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
                log.warn("discovery.dynamic_urls.search_failed", { query: q.query.slice(0, 80), error: String(error) });
              }
            }

            const scoredUrls = await scoreRelevance(allResults, company);

            for (const scored of scoredUrls) {
              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;

              // Scrape the actual article content from the discovered URL
              let scrapedContent: string;
              let scrapedTitle: string;
              
              try {
                const scrapeResult = await scrapeWithFallback(
                  scored.url,
                  (url) => new BlogScraper().scrapeArticle(url)
                );
                
                if (scrapeResult.article && scrapeResult.article.bodyText) {
                  scrapedContent = scrapeResult.article.bodyText;
                  scrapedTitle = scrapeResult.article.title || scored.rationale.slice(0, 200);
                  
                  log.info("web_search.scrape_success", {
                    url: scored.url,
                    method: scrapeResult.method,
                    contentLength: scrapeResult.article.bodyText.length,
                  });
                } else {
                  // Scraping failed - skip this URL
                  log.warn("web_search.scrape_failed", {
                    url: scored.url,
                    method: scrapeResult.method,
                    reason: scrapeResult.reason,
                  });
                  continue;
                }
              } catch (error) {
                log.warn("web_search.scrape_error", {
                  url: scored.url,
                  error: String(error),
                });
                continue;
              }

              // Content gate: two-stage relevance check
              // Stage 1: Fast string pre-filter (zero LLM cost)
              const fastCheck = checkCompanyRelevance({
                title: scrapedTitle,
                rawContent: scrapedContent,
                companyName: company.name,
                ticker: company.ticker,
                sector: company.sector,
                industry: company.industry,
              });
              if (!fastCheck.relevant) {
                log.info("web_search.content_gate.fast_rejected", {
                  url: scored.url,
                  company: company.name,
                  reason: fastCheck.reason,
                });
                if (runId) await addPipelineLog(runId, "warn", `Content gate (fast) rejected: ${fastCheck.reason}`, { url: scored.url });
                continue;
              }

              // Stage 2: LLM classifier — understands context, not just string presence
              const llmCheck = await classifyContentRelevance(
                scrapedTitle,
                scrapedContent,
                { name: company.name, ticker: company.ticker, description: company.description }
              );
              if (!llmCheck.relevant) {
                log.info("web_search.content_gate.llm_rejected", {
                  url: scored.url,
                  company: company.name,
                  confidence: llmCheck.confidence,
                  reasoning: llmCheck.reasoning,
                });
                if (runId) await addPipelineLog(runId, "warn", `Content gate (LLM) rejected: ${llmCheck.reasoning}`, { url: scored.url });
                continue;
              }

              await createSignalFromScraper(
                {
                  sourceUrl: scored.url,
                  title: scrapedTitle,
                  rawContent: scrapedContent,
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
            if (results.errors.length < 100) results.errors.push(`Dynamic URL discovery error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 21.5: Job postings
    if (shouldRunScraper("job-posting", data.scrapers)) {
      await step.run("process-job-postings", async () => {
        const jobScraper = new JobPostingScraper();
        const companiesWithWebsite = companies.filter((c) => c.websiteUrl !== null);

        log.info("discovery.job_postings.start", { companyCount: companiesWithWebsite.length });

        for (const company of companiesWithWebsite.slice(0, 10)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "job-posting", "JOB_POSTING");

            // Construct career page URL
            const baseUrl = new URL(company.websiteUrl!);
            const careerUrls = [
              `${baseUrl.origin}/careers`,
              `${baseUrl.origin}/jobs`,
              `${baseUrl.origin}/about/careers`,
            ];

            let jobUrls: string[] = [];
            for (const careerUrl of careerUrls) {
              jobUrls = await jobScraper.scrapeCareerPage(careerUrl, 10);
              if (jobUrls.length > 0) break;
            }

            if (jobUrls.length === 0) {
              log.info("discovery.job_postings.no_jobs_found", { company: company.name });
              await completePipelineRun(runId, 0, 0);
              continue;
            }

            results.jobPostingsProcessed++;

            for (const jobUrl of jobUrls) {
              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;

              try {
                const job = await jobScraper.scrapeJob(jobUrl);
                if (!job || !job.description || job.description.length < 100) {
                  continue;
                }

                await createSignalFromScraper(
                  {
                    sourceUrl: jobUrl,
                    title: job.title,
                    rawContent: `${job.title} at ${job.company}. Location: ${job.location}. Department: ${job.department}. ${job.description}`,
                    publishedAt: job.postedAt,
                    metadata: { ...job.metadata, requirements: job.requirements.join(", ") },
                  },
                  company.id,
                  "JOB_POSTING",
                  results,
                  runId,
                  jobScraper.getProvenance(),
                  jobScraper.scraperName
                );
                runSignalsCreated += results.signalsCreated - beforeCreated;
                runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
              } catch (jobError) {
                log.warn("discovery.job_postings.job_error", { url: jobUrl, error: String(jobError) });
              }
            }

            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`Job posting error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 21.6: Earnings call transcripts
    if (shouldRunScraper("transcript", data.scrapers)) {
      await step.run("process-transcripts", async () => {
        const transcriptScraper = new TranscriptScraper();
        const webSearchScraper = new WebSearchScraper();
        const companiesWithTickers = companies.filter((c) => c.ticker !== null);

        log.info("discovery.transcripts.start", { companyCount: companiesWithTickers.length });

        for (const company of companiesWithTickers.slice(0, 5)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "transcript", "TRANSCRIPT");

            // Search for recent earnings call transcripts
            const queries = [
              `${company.name} earnings call transcript Q4 2024`,
              `${company.name} earnings call transcript Q3 2024`,
              `${company.ticker} earnings transcript`,
            ];

            const transcriptUrls: string[] = [];
            for (const query of queries) {
              const searchResults = await webSearchScraper.search(query, { numResults: 5 });
              for (const result of searchResults) {
                if (result.url.includes("transcript") || result.title.toLowerCase().includes("transcript")) {
                  transcriptUrls.push(result.url);
                }
              }
              if (transcriptUrls.length >= 3) break;
            }

            if (transcriptUrls.length === 0) {
              log.info("discovery.transcripts.no_transcripts_found", { company: company.name });
              await completePipelineRun(runId, 0, 0);
              continue;
            }

            results.transcriptsProcessed++;

            for (const transcriptUrl of transcriptUrls.slice(0, 3)) {
              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;

              try {
                const transcript = await transcriptScraper.scrapeTranscript(transcriptUrl);
                if (!transcript || !transcript.fullText || transcript.fullText.length < 500) {
                  continue;
                }

                await createSignalFromScraper(
                  {
                    sourceUrl: transcriptUrl,
                    title: transcript.title,
                    rawContent: transcript.fullText,
                    publishedAt: transcript.publishedAt,
                    metadata: {
                      speakers: JSON.stringify(transcript.speakers),
                      sections: JSON.stringify(transcript.sections.length),
                    },
                  },
                  company.id,
                  "TRANSCRIPT",
                  results,
                  runId,
                  transcriptScraper.getProvenance(),
                  transcriptScraper.scraperName
                );
                runSignalsCreated += results.signalsCreated - beforeCreated;
                runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
              } catch (transcriptError) {
                log.warn("discovery.transcripts.transcript_error", { url: transcriptUrl, error: String(transcriptError) });
              }
            }

            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`Transcript error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 21.7: App Store changes (tracker)
    if (shouldRunScraper("appstore-tracker", data.scrapers)) {
      await step.run("process-appstore-changes", async () => {
        const appStoreTracker = new AppStoreTracker();
        const companiesWithTickers = companies.filter((c) => c.ticker !== null);

        log.info("discovery.appstore_changes.start", { companyCount: companiesWithTickers.length });

        for (const company of companiesWithTickers.slice(0, 10)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "appstore-tracker", "TECH_SIGNAL");
            const changes = await appStoreTracker.scrapeChanges(company.name);

            if (!changes || changes.length === 0) {
              await completePipelineRun(runId, 0, 0);
              continue;
            }

            results.appStoreChangesProcessed++;

            for (const change of changes.slice(0, 10)) {
              const trackerSignal = {
                title: `${change.appName} - ${change.changeType}`,
                rawContent: `${change.appName} by ${change.developer} in ${change.category}. ${change.changeType}. ${change.description}`,
              };

              const gate = await applyContentGate(trackerSignal, company, "appstore_tracker", log, runId);
              if (!gate.passed) continue;

              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;

              await createSignalFromScraper(
                {
                  sourceUrl: change.url,
                  ...trackerSignal,
                  publishedAt: change.publishedAt,
                  metadata: { rating: change.rating?.toString(), price: change.price },
                },
                company.id,
                "TECH_SIGNAL",
                results,
                runId,
                appStoreTracker.getProvenance(),
                appStoreTracker.scraperName
              );
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }

            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`App Store tracker error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 21.8: Conference agendas
    if (shouldRunScraper("conference-agenda", data.scrapers)) {
      await step.run("process-conference-agendas", async () => {
        const agendaScraper = new ConferenceAgendaScraper();
        const companiesWithTickers = companies.filter((c) => c.ticker !== null);

        log.info("discovery.conference_agendas.start", { companyCount: companiesWithTickers.length });

        for (const company of companiesWithTickers.slice(0, 10)) {
          let runId: string | null = null;
          let runSignalsCreated = 0;
          let runDuplicatesSkipped = 0;

          try {
            runId = await createPipelineRun(company.id, "conference-agenda", "CONFERENCE");
            const appearances = await agendaScraper.scrapeAgendas(company.name);

            if (!appearances || appearances.length === 0) {
              await completePipelineRun(runId, 0, 0);
              continue;
            }

            results.conferenceAgendasProcessed++;

            for (const appearance of appearances.slice(0, 10)) {
              const agendaSignal = {
                title: `${appearance.conferenceName}: ${appearance.title}`,
                rawContent: `${appearance.company} at ${appearance.conferenceName}. ${appearance.appearanceType}. ${appearance.description}`,
              };

              const gate = await applyContentGate(agendaSignal, company, "conference_agenda", log, runId);
              if (!gate.passed) continue;

              const beforeCreated = results.signalsCreated;
              const beforeDuplicates = results.duplicatesSkipped;

              await createSignalFromScraper(
                {
                  sourceUrl: appearance.url,
                  ...agendaSignal,
                  publishedAt: appearance.conferenceDate,
                  metadata: { executive: appearance.executive, location: appearance.location },
                },
                company.id,
                "CONFERENCE",
                results,
                runId,
                agendaScraper.getProvenance(),
                agendaScraper.scraperName
              );
              runSignalsCreated += results.signalsCreated - beforeCreated;
              runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
            }

            await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
          } catch (error) {
            if (results.errors.length < 100) results.errors.push(`Conference agenda error for ${company.name}: ${String(error)}`);
            if (runId) await failPipelineRun(runId, String(error));
          }
        }
      });
    }

    // Step 22: Log summary
    await step.run("log-summary", async () => {
      log.info("discovery.complete", {
        feedsProcessed: results.feedsProcessed,
        filingsProcessed: results.filingsProcessed,
        githubOrgsProcessed: results.githubOrgsProcessed,
        certDomainsProcessed: results.certDomainsProcessed,
        redditProcessed: results.redditProcessed,
        mastodonProcessed: results.mastodonProcessed,
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
        appStoreProcessed: results.appStoreProcessed,
        domainProcessed: results.domainProcessed,
        conferenceProcessed: results.conferenceProcessed,
        dynamicUrlsDiscovered: results.dynamicUrlsDiscovered,
        signalsCreated: results.signalsCreated,
        duplicatesSkipped: results.duplicatesSkipped,
        stealthFallbackAttempts: results.stealthFallbackAttempts,
        stealthFallbackSuccesses: results.stealthFallbackSuccesses,
        blogsProcessed: results.blogsProcessed,
        twitterTimelinesProcessed: results.twitterTimelinesProcessed,
        trackedSubredditsProcessed: results.trackedSubredditsProcessed,
        socialProfilesProcessed: results.socialProfilesProcessed,
        jobPostingsProcessed: results.jobPostingsProcessed,
        transcriptsProcessed: results.transcriptsProcessed,
        appStoreChangesProcessed: results.appStoreChangesProcessed,
        conferenceAgendasProcessed: results.conferenceAgendasProcessed,
        errorCount: results.errors.length,
      });

      if (results.errors.length > 0) {
        log.warn("discovery.errors", { errorCount: results.errors.length, errors: results.errors.slice(0, 10) });
      }
    });

    return { success: true, ...results };
  }
);

// ─── Helper Functions ───────────────────────────────────────────────────────

async function processFeedItem(
  item: {
    title: string;
    link: string;
    description: string;
    content: string;
    pubDate: Date | null;
    guid?: string;
    author?: string;
  },
  companyId: string,
  companyName: string,
  sourceType: SourceType,
  results: { signalsCreated: number; duplicatesSkipped: number },
  runId?: string | null,
  feedLabel?: string,
  provenance?: { scrapeAttempts: number; rawContentHash: string | null },
  scraperName?: string,
  companyInfo?: { name: string; ticker: string | null; description: string | null; sector: string | null; industry: string | null },
): Promise<void> {
  const log = logger.child({ function: "processFeedItem", itemUrl: item.link, companyId });

  const companyExists = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, ticker: true, description: true, sector: true, industry: true } });
  if (!companyExists) {
    log.error("Company not found in database", { companyId, itemUrl: item.link });
    if (runId) await addPipelineLog(runId, "error", `Company not found: ${companyId}`, { url: item.link });
    return;
  }

  if (!item.link || !item.title) {
    log.warn("Skipping feed item: missing link or title");
    return;
  }

  const normalizedUrl = normalizeUrl(item.link);
  const rawContent = item.content || item.description || item.title;

  // Content gate: fast string check for ambiguous company names
  if (companyInfo) {
    const fastCheck = checkCompanyRelevance({
      title: item.title,
      rawContent: rawContent,
      companyName: companyInfo.name,
      ticker: companyInfo.ticker,
      sector: companyInfo.sector,
      industry: companyInfo.industry,
    });
    if (!fastCheck.relevant) {
      log.info("rss.content_gate.fast_rejected", {
        url: item.link,
        company: companyInfo.name,
        reason: fastCheck.reason,
      });
      if (runId) await addPipelineLog(runId, "warn", `Content gate (fast) rejected: ${fastCheck.reason}`, { url: item.link });
      results.duplicatesSkipped++;
      return;
    }
  }

  const validation = validateAndCleanSignal({
    publishedAt: item.pubDate,
    author: null,
    rawContent: rawContent,
    sourceUrl: item.link,
    title: item.title,
  });

  if (!validation.valid) {
    log.warn("Signal validation failed", { url: item.link, issues: validation.issues });
    if (runId) await addPipelineLog(runId, "warn", `Signal validation failed: ${validation.issues.join(", ")}`, { url: item.link });
  }

  const content = validation.cleanedData?.rawContent || rawContent;
  const publishedAt = validation.cleanedData?.publishedAt || item.pubDate;
  const contentHash = computeContentHash(normalizedUrl, content);

  const existingSignal = await prisma.signal.findUnique({ where: { contentHash } });
  if (existingSignal) {
    log.info("Skipping duplicate signal", { contentHash, existingSignalId: existingSignal.id });
    results.duplicatesSkipped++;
    if (runId) await addPipelineLog(runId, "warn", `Skipped duplicate signal`, { url: item.link, contentHash });
    return;
  }

  try {
    const embedding = await generateEmbedding(content);
    const nearDuplicateId = await findNearDuplicate(embedding);
    if (nearDuplicateId) {
      log.info("Skipping near-duplicate signal (semantic)", { itemUrl: item.link, nearDuplicateId });
      results.duplicatesSkipped++;
      if (runId) await addPipelineLog(runId, "warn", `Skipped near-duplicate signal (semantic)`, { url: item.link, nearDuplicateId });
      return;
    }

    const signal = await prisma.signal.create({
      data: {
        sourceUrl: item.link,
        sourceType,
        title: item.title,
        rawContent: content,
        contentHash,
        publishedAt: publishedAt,
        author: item.author || validation.cleanedData?.author || null,
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

    await storeSignalEmbedding(signal.id, embedding);
    log.info("Created signal from RSS feed", { signalId: signal.id, sourceType, title: item.title });
    results.signalsCreated++;
    if (runId) await addPipelineLog(runId, "info", `Created signal: ${item.title}`, { url: item.link, signalId: signal.id });

    try {
      await inngest.send({ name: "signal/analysis.requested", data: { signalId: signal.id } });
    } catch (error) {
      log.error("Failed to trigger analysis, marking signal for retry", { signalId: signal.id, error: String(error) });
      try {
        await prisma.signal.update({
          where: { id: signal.id },
          data: { status: "FAILED" },
        });
      } catch (updateError) {
        log.error("Failed to mark signal for retry", { signalId: signal.id, error: String(updateError) });
      }
    }
  } catch (embedError) {
    log.warn("Embedding generation failed, creating signal without semantic dedup", { itemUrl: item.link, error: String(embedError) });

    let signal;
    try {
      signal = await prisma.signal.create({
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
    } catch (createError) {
      if (createError instanceof Prisma.PrismaClientKnownRequestError && createError.code === "P2002") {
        results.duplicatesSkipped++;
        return;
      }
      throw createError;
    }

    log.info("Created signal from RSS feed (no embedding)", { signalId: signal.id, sourceType, title: item.title });
    results.signalsCreated++;
    if (runId) await addPipelineLog(runId, "info", `Created signal: ${item.title}`, { url: item.link, signalId: signal.id });

    try {
      await inngest.send({ name: "signal/analysis.requested", data: { signalId: signal.id } });
    } catch (error) {
      log.error("Failed to trigger analysis, marking signal for retry", { signalId: signal.id, error: String(error) });
      try {
        await prisma.signal.update({
          where: { id: signal.id },
          data: { status: "FAILED" },
        });
      } catch (updateError) {
        log.error("Failed to mark signal for retry", { signalId: signal.id, error: String(updateError) });
      }
    }
  }
}

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
  const log = logger.child({ function: "processFiling", filingUrl: filing.filingUrl, companyId });

  if (!filing.filingUrl || !filing.form) {
    log.warn("Skipping filing: missing URL or form type");
    return;
  }

  const normalizedUrl = normalizeUrl(filing.filingUrl);
  const content = `${filing.form} - ${filing.description} filed ${filing.filingDate}`;
  const contentHash = computeContentHash(normalizedUrl, content);

  const existingSignal = await prisma.signal.findUnique({ where: { contentHash } });
  if (existingSignal) {
    results.duplicatesSkipped++;
    if (runId) await addPipelineLog(runId, "warn", `Skipped duplicate filing`, { url: filing.filingUrl, contentHash });
    return;
  }

  try {
    const embedding = await generateEmbedding(content);
    const nearDuplicateId = await findNearDuplicate(embedding);
    if (nearDuplicateId) {
      results.duplicatesSkipped++;
      if (runId) await addPipelineLog(runId, "warn", `Skipped near-duplicate filing (semantic)`, { url: filing.filingUrl, nearDuplicateId });
      return;
    }

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

    await storeSignalEmbedding(signal.id, embedding);
    results.signalsCreated++;
    if (runId) await addPipelineLog(runId, "info", `Created signal: ${filing.form} - ${companyName}`, { url: filing.filingUrl, signalId: signal.id });

    try {
      await inngest.send({ name: "signal/analysis.requested", data: { signalId: signal.id } });
    } catch (error) {
      log.error("Failed to trigger analysis, marking signal for retry", { signalId: signal.id, error: String(error) });
      try {
        await prisma.signal.update({
          where: { id: signal.id },
          data: { status: "FAILED" },
        });
      } catch (updateError) {
        log.error("Failed to mark signal for retry", { signalId: signal.id, error: String(updateError) });
      }
    }
  } catch (embedError) {
    log.warn("Embedding generation failed for filing, creating without semantic dedup", { filingUrl: filing.filingUrl, error: String(embedError) });

    let signal;
    try {
      signal = await prisma.signal.create({
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
    } catch (createError) {
      if (createError instanceof Prisma.PrismaClientKnownRequestError && createError.code === "P2002") {
        results.duplicatesSkipped++;
        return;
      }
      throw createError;
    }

    results.signalsCreated++;
    if (runId) await addPipelineLog(runId, "info", `Created signal: ${filing.form} - ${companyName}`, { url: filing.filingUrl, signalId: signal.id });

    try {
      await inngest.send({ name: "signal/analysis.requested", data: { signalId: signal.id } });
    } catch (error) {
      log.error("Failed to trigger analysis, marking signal for retry", { signalId: signal.id, error: String(error) });
      try {
        await prisma.signal.update({
          where: { id: signal.id },
          data: { status: "FAILED" },
        });
      } catch (updateError) {
        log.error("Failed to mark signal for retry", { signalId: signal.id, error: String(updateError) });
      }
    }
  }
}

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
  const log = logger.child({ function: "createSignalFromScraper", sourceUrl: scraperSignal.sourceUrl, companyId, sourceType });

  if (!scraperSignal.sourceUrl || !scraperSignal.title) {
    log.warn("Skipping scraper signal: missing URL or title");
    return { created: false };
  }

  const validation = validateAndCleanSignal({
    publishedAt: scraperSignal.publishedAt,
    author: scraperSignal.author || null,
    rawContent: scraperSignal.rawContent,
    sourceUrl: scraperSignal.sourceUrl,
    title: scraperSignal.title,
  });

  if (!validation.valid) {
    log.warn("Signal validation issues detected", { url: scraperSignal.sourceUrl, issues: validation.issues });
    if (runId) await addPipelineLog(runId, "warn", `Signal validation issues: ${validation.issues.join(", ")}`, { url: scraperSignal.sourceUrl });
  }

  const cleanedContent = validation.cleanedData?.rawContent || scraperSignal.rawContent;
  const cleanedPublishedAt = validation.cleanedData?.publishedAt || scraperSignal.publishedAt;
  const cleanedAuthor = validation.cleanedData?.author || scraperSignal.author || null;

  const normalizedUrl = normalizeUrl(scraperSignal.sourceUrl);
  const contentHash = computeContentHash(normalizedUrl, cleanedContent);

  const existingSignal = await prisma.signal.findUnique({ where: { contentHash } });
  if (existingSignal) {
    results.duplicatesSkipped++;
    if (runId) await addPipelineLog(runId, "warn", `Skipped duplicate signal`, { url: scraperSignal.sourceUrl, contentHash });
    return { created: false };
  }

  try {
    const embedding = await generateEmbedding(scraperSignal.rawContent);
    const nearDuplicateId = await findNearDuplicate(embedding);
    if (nearDuplicateId) {
      results.duplicatesSkipped++;
      if (runId) await addPipelineLog(runId, "warn", `Skipped near-duplicate signal (semantic)`, { url: scraperSignal.sourceUrl, nearDuplicateId });
      return { created: false };
    }

    const signal = await prisma.signal.create({
      data: {
        sourceUrl: scraperSignal.sourceUrl,
        sourceType,
        title: scraperSignal.title,
        rawContent: cleanedContent,
        contentHash,
        publishedAt: cleanedPublishedAt,
        companyId,
        status: "PENDING",
        engagement: (scraperSignal.engagement as Prisma.InputJsonValue) ?? undefined,
        author: cleanedAuthor,
        metadata: (scraperSignal.metadata as Prisma.InputJsonValue) ?? undefined,
        scraperName: scraperName ?? null,
        verified: true,
        scrapeAttempts: provenance?.scrapeAttempts ?? null,
        rawContentHash: provenance?.rawContentHash ?? null,
        dataOrigin: "SCRAPED",
      },
    });

    await storeSignalEmbedding(signal.id, embedding);
    results.signalsCreated++;
    if (runId) await addPipelineLog(runId, "info", `Created signal: ${scraperSignal.title}`, { url: scraperSignal.sourceUrl, signalId: signal.id });

    try {
      await inngest.send({ name: "signal/analysis.requested", data: { signalId: signal.id } });
    } catch (error) {
      log.error("Failed to trigger analysis, marking signal for retry", { signalId: signal.id, error: String(error) });
      try {
        await prisma.signal.update({
          where: { id: signal.id },
          data: { status: "FAILED" },
        });
      } catch (updateError) {
        log.error("Failed to mark signal for retry", { signalId: signal.id, error: String(updateError) });
      }
    }

    return { created: true };
  } catch (embedError) {
    log.warn("Embedding generation failed for scraper signal, creating without semantic dedup", { sourceUrl: scraperSignal.sourceUrl, error: String(embedError) });

    let signal;
    try {
      signal = await prisma.signal.create({
        data: {
          sourceUrl: scraperSignal.sourceUrl,
          sourceType,
          title: scraperSignal.title,
          rawContent: cleanedContent,
          contentHash,
          publishedAt: cleanedPublishedAt,
          companyId,
          status: "PENDING",
          engagement: (scraperSignal.engagement as Prisma.InputJsonValue) ?? undefined,
          author: cleanedAuthor,
          metadata: (scraperSignal.metadata as Prisma.InputJsonValue) ?? undefined,
          scraperName: scraperName ?? null,
          verified: true,
          scrapeAttempts: provenance?.scrapeAttempts ?? null,
          rawContentHash: provenance?.rawContentHash ?? null,
          dataOrigin: "SCRAPED",
        },
      });
    } catch (createError) {
      if (createError instanceof Prisma.PrismaClientKnownRequestError && createError.code === "P2002") {
        results.duplicatesSkipped++;
        return { created: false };
      }
      throw createError;
    }

    results.signalsCreated++;
    if (runId) await addPipelineLog(runId, "info", `Created signal: ${scraperSignal.title}`, { url: scraperSignal.sourceUrl, signalId: signal.id });

    try {
      await inngest.send({ name: "signal/analysis.requested", data: { signalId: signal.id } });
    } catch (error) {
      log.error("Failed to trigger analysis, marking signal for retry", { signalId: signal.id, error: String(error) });
      try {
        await prisma.signal.update({
          where: { id: signal.id },
          data: { status: "FAILED" },
        });
      } catch (updateError) {
        log.error("Failed to mark signal for retry", { signalId: signal.id, error: String(updateError) });
      }
    }

    return { created: true };
  }
}

export const signalDiscoveryFunctions = [discoverSignalsUnifiedFunction];
