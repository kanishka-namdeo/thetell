/**
 * Company-scoped discovery function for manual pipeline runs.
 * Triggered via Inngest event from admin UI.
 */

import { inngest } from "./client";
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
import { AppStoreScraper } from "@/lib/scraping/app-store-scraper";
import { ConferenceScraper } from "@/lib/scraping/conference-scraper";
import { DomainTracker } from "@/lib/scraping/domain-tracker";
import { getAllFeeds, getFeedsFromDBByCompanyId } from "@/lib/scraping/feed-registry";
import { normalizeUrl, computeContentHash } from "@/lib/scraping/url-normalizer";
import { logger } from "@/lib/logger";
import { generateEmbedding } from "@/lib/nlp/embedding-generator";
import { storeSignalEmbedding, findNearDuplicate } from "@/lib/nlp/embedding-store";
import type { SourceType } from "@prisma/client";
import { Prisma } from "@prisma/client";

/**
 * Company-scoped discovery function that runs all scrapers for a specific company.
 * Triggered manually from admin UI.
 */
export const discoverCompanySignalsFunction = inngest.createFunction(
  {
    id: "discover-company-signals",
    triggers: { event: "company/discovery.requested" },
    retries: 1,
  },
  async ({ event, step }) => {
    const { companyId, scrapers } = event.data;
    const log = logger.child({ function: "discover-company-signals", companyId });
    log.info("company_discovery.start", { companyId, scrapers });

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, ticker: true, websiteUrl: true },
    });

    if (!company) {
      throw new Error(`Company not found: ${companyId}`);
    }

    const results = {
      signalsCreated: 0,
      duplicatesSkipped: 0,
      errors: [] as string[],
    };

    const scraperList = scrapers || [
      "rss-feed",
      "sec-filing",
      "github",
      "cert-transparency",
      "reddit-financial",
      "press-release",
      "uspto",
      "courtlistener",
      "fda",
      "sam",
      "wayback",
      "congress",
      "academic",
      "app-store",
      "conference",
      "domain-tracker",
    ];

    // Step 1: RSS feeds
    if (scraperList.includes("rss-feed")) {
      await step.run("process-rss-feeds", async () => {
        const rssScraper = new RssScraper();
        // Try DB-backed feeds first, fall back to hardcoded if empty
        const dbFeed = await getFeedsFromDBByCompanyId(companyId);
        const feeds = dbFeed ? [dbFeed] : getAllFeeds().filter((f) => f.companyId === companyId);

        for (const companyFeed of feeds) {
          for (const feed of companyFeed.feeds) {
            let runId: string | null = null;
            try {
              runId = await createPipelineRun(companyId, "rss-feed", (feed.sourceType || "RSS") as SourceType);
              const feedData = await rssScraper.scrapeFeed(feed.url);
              if (!feedData) {
                await addPipelineLog(runId, "warn", "Failed to fetch feed", { url: feed.url });
                await completePipelineRun(runId, 0, 0);
                continue;
              }

              for (const item of feedData.items.slice(0, 10)) {
                await processFeedItem(item, companyId, company.name, (feed.sourceType || "RSS") as SourceType, results, runId);
              }
              await completePipelineRun(runId, results.signalsCreated, results.duplicatesSkipped);
            } catch (error) {
              if (runId) await failPipelineRun(runId, String(error));
              results.errors.push(`RSS feed error: ${String(error)}`);
            }
          }
        }
      });
    }

    // Step 2: SEC filings
    if (scraperList.includes("sec-filing")) {
      await step.run("process-sec-filings", async () => {
        const filingScraper = new FilingScraper();
        let runId: string | null = null;
        try {
          runId = await createPipelineRun(companyId, "sec-filing", "FILING");
          const filingData = await filingScraper.scrapeFilingsByCompanyName(company.name);
          if (!filingData) {
            await addPipelineLog(runId, "warn", "No filings found");
            await completePipelineRun(runId, 0, 0);
            return;
          }

          for (const filing of filingData.filings.slice(0, 5)) {
            await processFiling(filing, companyId, company.name, results, runId);
          }
          await completePipelineRun(runId, results.signalsCreated, results.duplicatesSkipped);
        } catch (error) {
          if (runId) await failPipelineRun(runId, String(error));
          results.errors.push(`SEC filing error: ${String(error)}`);
        }
      });
    }

    // Step 3: GitHub
    if (scraperList.includes("github") && company.websiteUrl) {
      await step.run("process-github", async () => {
        const githubScraper = new GitHubScraper();
        let runId: string | null = null;
        try {
          runId = await createPipelineRun(companyId, "github", "TECH_SIGNAL");
          const domain = extractDomain(company.websiteUrl!);
          const orgName = domain.split(".")[0];
          const signals = await githubScraper.scrape(orgName);

          for (const signal of signals.slice(0, 5)) {
            const mapped = {
              sourceUrl: signal.url,
              title: signal.title,
              rawContent: signal.description,
              publishedAt: signal.publishedAt,
            };
            await createSignalFromScraper(mapped, companyId, "TECH_SIGNAL", results, runId);
          }
          await completePipelineRun(runId, results.signalsCreated, results.duplicatesSkipped);
        } catch (error) {
          if (runId) await failPipelineRun(runId, String(error));
          results.errors.push(`GitHub error: ${String(error)}`);
        }
      });
    }

    // Step 4: Reddit
    if (scraperList.includes("reddit-financial") && company.ticker) {
      await step.run("process-reddit", async () => {
        const redditScraper = new RedditFinancialScraper();
        let runId: string | null = null;
        try {
          runId = await createPipelineRun(companyId, "reddit-financial", "SOCIAL");
          const signals = await redditScraper.scrape([company.ticker!]);

          for (const signal of signals.slice(0, 20)) {
            const mapped = {
              sourceUrl: signal.url,
              title: signal.title,
              rawContent: signal.bodyText,
              publishedAt: signal.publishedAt,
              engagement: signal.engagement,
              author: signal.author ?? undefined,
              metadata: signal.metadata,
            };
            await createSignalFromScraper(mapped, companyId, "SOCIAL", results, runId);
          }
          await completePipelineRun(runId, results.signalsCreated, results.duplicatesSkipped);
        } catch (error) {
          if (runId) await failPipelineRun(runId, String(error));
          results.errors.push(`Reddit error: ${String(error)}`);
        }
      });
    }

    // Step 5: Press releases
    if (scraperList.includes("press-release")) {
      await step.run("process-press-releases", async () => {
        const pressScraper = new PressReleaseScraper();
        let runId: string | null = null;
        try {
          runId = await createPipelineRun(companyId, "press-release", "PRESS_RELEASE");
          const signals = await pressScraper.scrape();

          for (const signal of signals.slice(0, 10)) {
            const mapped = {
              sourceUrl: signal.url,
              title: signal.title,
              rawContent: signal.bodyText,
              publishedAt: signal.publishedAt,
            };
            await createSignalFromScraper(mapped, companyId, "PRESS_RELEASE", results, runId);
          }
          await completePipelineRun(runId, results.signalsCreated, results.duplicatesSkipped);
        } catch (error) {
          if (runId) await failPipelineRun(runId, String(error));
          results.errors.push(`Press release error: ${String(error)}`);
        }
      });
    }

    // Step 6: App Store
    if (scraperList.includes("app-store")) {
      await step.run("process-app-store", async () => {
        const appStoreScraper = new AppStoreScraper();
        let runId: string | null = null;
        try {
          runId = await createPipelineRun(companyId, "app-store", "TECH_SIGNAL");
          const signals = await appStoreScraper.scrape(company.name);

          for (const signal of signals.slice(0, 10)) {
            const mapped = {
              sourceUrl: signal.url,
              title: signal.title,
              rawContent: signal.description,
              publishedAt: signal.publishedAt,
            };
            await createSignalFromScraper(mapped, companyId, "TECH_SIGNAL", results, runId);
          }
          await completePipelineRun(runId, results.signalsCreated, results.duplicatesSkipped);
        } catch (error) {
          if (runId) await failPipelineRun(runId, String(error));
          results.errors.push(`App Store error: ${String(error)}`);
        }
      });
    }

    // Step 7: Conference
    if (scraperList.includes("conference")) {
      await step.run("process-conference", async () => {
        const conferenceScraper = new ConferenceScraper();
        let runId: string | null = null;
        try {
          runId = await createPipelineRun(companyId, "conference", "CONFERENCE");
          const signals = await conferenceScraper.scrape(company.name);

          for (const signal of signals.slice(0, 10)) {
            const mapped = {
              sourceUrl: signal.url,
              title: signal.title,
              rawContent: signal.description,
              publishedAt: signal.publishedAt,
            };
            await createSignalFromScraper(mapped, companyId, "CONFERENCE", results, runId);
          }
          await completePipelineRun(runId, results.signalsCreated, results.duplicatesSkipped);
        } catch (error) {
          if (runId) await failPipelineRun(runId, String(error));
          results.errors.push(`Conference error: ${String(error)}`);
        }
      });
    }

    // Step 8: Domain Tracker
    if (scraperList.includes("domain-tracker")) {
      await step.run("process-domain-tracker", async () => {
        const domainTracker = new DomainTracker();
        let runId: string | null = null;
        try {
          runId = await createPipelineRun(companyId, "domain-tracker", "TECH_SIGNAL");
          const registrations = await domainTracker.scrapeDomains(company.name);

          if (registrations) {
            for (const reg of registrations.slice(0, 10)) {
              const mapped = {
                sourceUrl: reg.url,
                title: `New domain registered: ${reg.domain}`,
                rawContent: `Domain ${reg.domain} registered by ${reg.registrant} via ${reg.registrar}. Name servers: ${reg.nameServers.join(", ")}`,
                publishedAt: reg.registeredAt,
              };
              await createSignalFromScraper(mapped, companyId, "TECH_SIGNAL", results, runId);
            }
          }
          await completePipelineRun(runId, results.signalsCreated, results.duplicatesSkipped);
        } catch (error) {
          if (runId) await failPipelineRun(runId, String(error));
          results.errors.push(`Domain Tracker error: ${String(error)}`);
        }
      });
    }

    log.info("company_discovery.complete", {
      companyId,
      signalsCreated: results.signalsCreated,
      duplicatesSkipped: results.duplicatesSkipped,
      errorCount: results.errors.length,
    });

    return {
      success: true,
      companyId,
      ...results,
    };
  }
);

// Helper functions (copied from discovery.ts)

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
      details: details as Prisma.InputJsonValue | undefined,
    },
  });
}

async function processFeedItem(
  item: { title: string; link: string; description: string; content: string; pubDate: Date | null },
  companyId: string,
  companyName: string,
  sourceType: SourceType,
  results: { signalsCreated: number; duplicatesSkipped: number },
  runId: string
) {
  const normalizedUrl = normalizeUrl(item.link);
  const content = item.content || item.description || item.title;
  const contentHash = computeContentHash(normalizedUrl, content);

  const existingSignal = await prisma.signal.findUnique({ where: { contentHash } });
  if (existingSignal) {
    results.duplicatesSkipped++;
    return;
  }

  try {
    const embedding = await generateEmbedding(content);
    const nearDuplicateId = await findNearDuplicate(embedding);
    if (nearDuplicateId) {
      results.duplicatesSkipped++;
      return;
    }

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

    await storeSignalEmbedding(signal.id, embedding);
    results.signalsCreated++;

    await inngest.send({
      name: "signal/analysis.requested",
      data: { signalId: signal.id },
    });
  } catch (error) {
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
    results.signalsCreated++;

    await inngest.send({
      name: "signal/analysis.requested",
      data: { signalId: signal.id },
    });
  }
}

async function processFiling(
  filing: { accessionNumber: string; filingDate: string; reportDate: string | null; form: string; filingUrl: string; primaryDocument: string; primaryDocUrl: string; description: string },
  companyId: string,
  companyName: string,
  results: { signalsCreated: number; duplicatesSkipped: number },
  runId: string
) {
  const normalizedUrl = normalizeUrl(filing.filingUrl);
  const content = `${filing.form} - ${filing.description} filed ${filing.filingDate}`;
  const contentHash = computeContentHash(normalizedUrl, content);

  const existingSignal = await prisma.signal.findUnique({ where: { contentHash } });
  if (existingSignal) {
    results.duplicatesSkipped++;
    return;
  }

  try {
    const embedding = await generateEmbedding(content);
    const nearDuplicateId = await findNearDuplicate(embedding);
    if (nearDuplicateId) {
      results.duplicatesSkipped++;
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
      },
    });

    await storeSignalEmbedding(signal.id, embedding);
    results.signalsCreated++;

    await inngest.send({
      name: "signal/analysis.requested",
      data: { signalId: signal.id },
    });
  } catch (error) {
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
    results.signalsCreated++;

    await inngest.send({
      name: "signal/analysis.requested",
      data: { signalId: signal.id },
    });
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
  runId: string
) {
  const normalizedUrl = normalizeUrl(scraperSignal.sourceUrl);
  const contentHash = computeContentHash(normalizedUrl, scraperSignal.rawContent);

  const existingSignal = await prisma.signal.findUnique({ where: { contentHash } });
  if (existingSignal) {
    results.duplicatesSkipped++;
    return;
  }

  try {
    const embedding = await generateEmbedding(scraperSignal.rawContent);
    const nearDuplicateId = await findNearDuplicate(embedding);
    if (nearDuplicateId) {
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
        engagement: (scraperSignal.engagement as Prisma.InputJsonValue) ?? undefined,
        author: scraperSignal.author ?? undefined,
        metadata: (scraperSignal.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });

    await storeSignalEmbedding(signal.id, embedding);
    results.signalsCreated++;

    await inngest.send({
      name: "signal/analysis.requested",
      data: { signalId: signal.id },
    });
  } catch (error) {
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
      },
    });
    results.signalsCreated++;

    await inngest.send({
      name: "signal/analysis.requested",
      data: { signalId: signal.id },
    });
  }
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const companyDiscoveryFunctions = [discoverCompanySignalsFunction];
