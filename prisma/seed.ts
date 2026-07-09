import { config } from "dotenv";
import { resolve } from "path";
import { createHash } from "crypto";

// Load .env.local from project root (Prisma seed runs from prisma/ directory)
config({ path: resolve(__dirname, "../.env.local") });

import { PrismaClient, Role, SourceType, DataOrigin, SignalStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { RssScraper } from "../src/lib/scraping/rss-scraper";
import { getFeedsByCompanyId } from "../src/lib/scraping/feed-registry";
import { analyzeSignalWithAgent } from "../src/lib/ai/agent/pipeline";
import type { CrossRefAnalysis } from "../src/lib/ai/agent/pipeline";
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from "../src/lib/ai/agent/personas";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const ITEMS_PER_FEED_LIMIT = 5;
const DELAY_BETWEEN_LLM_CALLS_MS = 2500;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function computeContentHash(url: string, content: string): string {
  return createHash("sha256").update(url + content).digest("hex");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== Seeding database with real RSS data ===\n");

  // ─── 1. Users ────────────────────────────────────────────────────────────
  console.log("Step 1: Ensuring users exist...");
  const passwordHash = await bcrypt.hash("password123", 10);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@thetell.com" },
    update: { passwordHash },
    create: {
      email: "admin@thetell.com",
      name: "Admin User",
      passwordHash,
      role: Role.ADMIN,
      emailVerified: new Date(),
    },
  });

  await prisma.user.upsert({
    where: { email: "analyst@thetell.com" },
    update: { passwordHash },
    create: {
      email: "analyst@thetell.com",
      name: "Test Analyst",
      passwordHash,
      role: Role.USER,
      emailVerified: new Date(),
    },
  });
  console.log("  Users ready.\n");

  // ─── 2. Companies ────────────────────────────────────────────────────────
  console.log("Step 2: Ensuring companies exist...");
  const companies = [
    {
      name: "Apple Inc.",
      slug: "apple",
      ticker: "AAPL",
      description:
        "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide.",
      websiteUrl: "https://www.apple.com",
    },
    {
      name: "Tesla, Inc.",
      slug: "tesla",
      ticker: "TSLA",
      description:
        "Tesla, Inc. designs, develops, manufactures, leases, and sells electric vehicles, and energy generation and storage systems.",
      websiteUrl: "https://www.tesla.com",
    },
    {
      name: "NVIDIA Corporation",
      slug: "nvidia",
      ticker: "NVDA",
      description:
        "NVIDIA Corporation, a computing infrastructure company, provides graphics and compute and networking solutions worldwide.",
      websiteUrl: "https://www.nvidia.com",
    },
    {
      name: "Advanced Micro Devices, Inc.",
      slug: "amd",
      ticker: "AMD",
      description:
        "Advanced Micro Devices, Inc. operates as a semiconductor company worldwide, offering data center accelerators, CPUs, GPUs, networking products, and adaptive computing solutions.",
      websiteUrl: "https://www.amd.com",
    },
    {
      name: "Microsoft Corporation",
      slug: "microsoft",
      ticker: "MSFT",
      description:
        "Microsoft Corporation develops, licenses, and supports software, services, devices, and solutions worldwide.",
      websiteUrl: "https://www.microsoft.com",
    },
  ];

  for (const company of companies) {
    await prisma.company.upsert({
      where: { slug: company.slug },
      update: {},
      create: company,
    });
  }

  const apple = await prisma.company.findUnique({ where: { slug: "apple" } });
  const tesla = await prisma.company.findUnique({ where: { slug: "tesla" } });
  const nvidia = await prisma.company.findUnique({ where: { slug: "nvidia" } });
  const amd = await prisma.company.findUnique({ where: { slug: "amd" } });
  const microsoft = await prisma.company.findUnique({ where: { slug: "microsoft" } });

  if (!apple || !tesla || !nvidia || !amd || !microsoft) {
    throw new Error("Failed to find companies after upsert");
  }

  const companyRecords = [apple, tesla, nvidia, amd, microsoft];
  console.log(`  ${companyRecords.length} companies ready.\n`);

  // ─── 3. Scrape RSS feeds ─────────────────────────────────────────────────
  console.log("Step 3: Scraping RSS feeds for each company...");
  const scraper = new RssScraper();

  let totalFeedsScraped = 0;
  let totalSignalsCreated = 0;
  let totalDuplicatesSkipped = 0;
  let totalFeedsFailed = 0;

  interface ScrapedSignal {
    id: string;
    companyId: string;
    companyName: string;
    companySlug: string;
    sourceUrl: string;
    title: string;
    rawContent: string;
  }

  const scrapedSignals: ScrapedSignal[] = [];

  for (const company of companyRecords) {
    const feedConfig = getFeedsByCompanyId(company.slug);
    if (!feedConfig) {
      console.log(`  [${company.name}] No feeds registered — skipping.`);
      continue;
    }

    console.log(
      `\n  [${company.name}] ${feedConfig.feeds.length} feed(s) registered`
    );

    for (const feed of feedConfig.feeds) {
      console.log(`    -> ${feed.label} (${feed.url})`);
      try {
        const feedData = await scraper.scrapeFeed(feed.url);
        if (!feedData || feedData.items.length === 0) {
          console.log(`       No items returned.`);
          totalFeedsFailed++;
          continue;
        }

        totalFeedsScraped++;
        const itemsToProcess = feedData.items.slice(0, ITEMS_PER_FEED_LIMIT);
        console.log(
          `       Parsed ${feedData.items.length} item(s); processing ${itemsToProcess.length}.`
        );

        for (const item of itemsToProcess) {
          let rawContent = stripHtml(item.content || item.description || "");
          
          // For link-only RSS feeds (common with IR feeds), fetch the linked page content
          if ((!rawContent || rawContent.length < 50) && item.link) {
            try {
              console.log(`       - fetching content from linked page: ${item.link.slice(0, 60)}...`);
              const pageContent = await scraper.fetch(item.link);
              if (pageContent) {
                // Extract text content from HTML - simple approach
                rawContent = stripHtml(pageContent);
                // Limit to first 2000 chars to avoid huge content
                rawContent = rawContent.slice(0, 2000);
              }
            } catch (fetchError) {
              console.log(`       - failed to fetch linked page: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
            }
          }
          
          if (!item.link || !rawContent || rawContent.length < 50) {
            console.log(
              `       - skip (insufficient content): "${(item.title || "").slice(0, 50)}"`
            );
            continue;
          }

          const contentHash = computeContentHash(item.link, rawContent);

          // Dedup by contentHash
          const existing = await prisma.signal.findUnique({
            where: { contentHash },
          });
          if (existing) {
            totalDuplicatesSkipped++;
            continue;
          }

          // Also dedup by sourceUrl
          const existingByUrl = await prisma.signal.findFirst({
            where: { sourceUrl: item.link },
          });
          if (existingByUrl) {
            totalDuplicatesSkipped++;
            continue;
          }

          const sourceType: SourceType =
            feed.sourceType === "NEWS"
              ? SourceType.NEWS
              : feed.sourceType === "BLOG"
                ? SourceType.BLOG
                : feed.sourceType === "FILING"
                  ? SourceType.FILING
                  : feed.sourceType === "TRANSCRIPT"
                    ? SourceType.TRANSCRIPT
                    : feed.sourceType === "SOCIAL"
                      ? SourceType.SOCIAL
                      : SourceType.NEWS;

          const rawContentHash = createHash("sha256")
            .update(rawContent)
            .digest("hex");

          const signal = await prisma.signal.create({
            data: {
              sourceUrl: item.link,
              sourceType,
              title: item.title || "Untitled",
              rawContent,
              contentHash,
              publishedAt: item.pubDate,
              companyId: company.id,
              status: SignalStatus.PENDING,
              scraperName: "rss-scraper",
              verified: true,
              dataOrigin: DataOrigin.BOOTSTRAP,
              feedLabel: feed.label,
              scrapeAttempts: 1,
              rawContentHash,
            },
          });

          totalSignalsCreated++;
          scrapedSignals.push({
            id: signal.id,
            companyId: company.id,
            companyName: company.name,
            companySlug: company.slug,
            sourceUrl: signal.sourceUrl,
            title: signal.title,
            rawContent: signal.rawContent,
          });
        }
      } catch (feedError) {
        console.log(
          `       FAILED: ${feedError instanceof Error ? feedError.message : String(feedError)}`
        );
        totalFeedsFailed++;
      }
    }
  }

  console.log(
    `\n  RSS scraping complete: ${totalFeedsScraped} feeds scraped, ${totalSignalsCreated} signals created, ${totalDuplicatesSkipped} duplicates skipped, ${totalFeedsFailed} feeds failed.\n`
  );

  // ─── 4. Optional dual-agent analysis ─────────────────────────────────────
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;

  if (!hasOpenAI && !hasAnthropic) {
    console.log(
      "Step 4: Skipping analysis — no OPENAI_API_KEY or ANTHROPIC_API_KEY set."
    );
    console.log(
      "  To enable dual-agent analysis + article generation, set one of these in .env.local.\n"
    );
  } else {
    console.log(
      `Step 4: Running dual-agent analysis on ${scrapedSignals.length} signal(s)...`
    );

    interface DualAgentResult {
      signalId: string;
      companyId: string;
      companyName: string;
      analyst: {
        id: string;
        summary: string;
        keyFacts: Array<{ text: string }>;
        sentiment: string;
        strategicThemes: Array<{ label: string }>;
        confidence: number;
        modelUsed: string;
      };
      gossipGirl: {
        id: string;
        summary: string;
        keyFacts: Array<{ text: string }>;
        sentiment: string;
        strategicThemes: Array<{ label: string }>;
        confidence: number;
        modelUsed: string;
      };
    }

    const dualResults: DualAgentResult[] = [];
    let analyzedCount = 0;
    let analysisFailedCount = 0;

    for (let i = 0; i < scrapedSignals.length; i++) {
      const sig = scrapedSignals[i];
      console.log(
        `\n  [${i + 1}/${scrapedSignals.length}] ${sig.title.slice(0, 70)}`
      );

      // Skip if already analyzed
      const existingAnalyst = await prisma.analysis.findUnique({
        where: { signalId_agentPersona: { signalId: sig.id, agentPersona: "ANALYST" } },
      });
      const existingGossip = await prisma.analysis.findUnique({
        where: { signalId_agentPersona: { signalId: sig.id, agentPersona: "GOSSIP_GIRL" } },
      });

      if (existingAnalyst && existingGossip) {
        console.log("    -> Already analyzed, skipping.");
        dualResults.push({
          signalId: sig.id,
          companyId: sig.companyId,
          companyName: sig.companyName,
          analyst: existingAnalyst as unknown as DualAgentResult["analyst"],
          gossipGirl: existingGossip as unknown as DualAgentResult["gossipGirl"],
        });
        continue;
      }

      await prisma.signal.update({
        where: { id: sig.id },
        data: { status: SignalStatus.ANALYZING },
      });

      const signalInput = {
        id: sig.id,
        sourceUrl: sig.sourceUrl,
        sourceType: "NEWS" as const,
        title: sig.title,
        rawContent: sig.rawContent,
        publishedAt: new Date(),
        scrapedAt: new Date(),
        companyId: sig.companyId,
        status: SignalStatus.ANALYZING,
        company: {
          id: sig.companyId,
          name: sig.companyName,
          slug: sig.companySlug,
          ticker: null,
        },
      };

      try {
        console.log("    Running Analyst agent...");
        const { analysis: analystResult } = await analyzeSignalWithAgent(
          signalInput,
          ANALYST_CONFIG,
          undefined,
          hasOpenAI ? "openai" : "anthropic"
        );

        const analystSentimentLabel =
          "sentiment" in analystResult.sentiment
            ? analystResult.sentiment.sentiment
            : "NEUTRAL";

        await prisma.analysis.create({
          data: {
            id: analystResult.id,
            signalId: sig.id,
            agentPersona: "ANALYST",
            summary: analystResult.summary,
            keyFacts: analystResult.keyFacts,
            sentiment: analystSentimentLabel,
            sentimentData: analystResult.sentiment,
            strategicThemes: analystResult.strategicThemes,
            confidence: analystResult.confidence,
            modelUsed: analystResult.modelUsed,
          },
        });

        console.log(
          `    -> Analyst done (confidence: ${analystResult.confidence.toFixed(2)}, sentiment: ${analystSentimentLabel})`
        );

        await delay(DELAY_BETWEEN_LLM_CALLS_MS);

        console.log("    Running Gossip Girl agent...");
        const crossRefAnalyses: CrossRefAnalysis[] = [
          {
            id: analystResult.id,
            agentPersona: analystResult.agentPersona,
            summary: analystResult.summary,
            keyFacts: analystResult.keyFacts.map((f) => ({ text: f.text })),
            sentiment: analystSentimentLabel,
            strategicThemes: analystResult.strategicThemes.map((t) => ({
              label: t.label,
            })),
          },
        ];

        const { analysis: gossipResult } = await analyzeSignalWithAgent(
          signalInput,
          GOSSIP_GIRL_CONFIG,
          crossRefAnalyses,
          hasOpenAI ? "openai" : "anthropic"
        );

        const gossipSentimentLabel =
          "surface_reading" in gossipResult.sentiment
            ? ((
                {
                  "bullish-spin": "POSITIVE",
                  "bearish-subtext": "NEGATIVE",
                  "neutral-surface": "NEUTRAL",
                  "mixed-signals": "NEUTRAL",
                } as Record<string, "POSITIVE" | "NEGATIVE" | "NEUTRAL">
              )[gossipResult.sentiment.surface_reading] ?? "NEUTRAL")
            : "NEUTRAL";

        await prisma.analysis.create({
          data: {
            id: gossipResult.id,
            signalId: sig.id,
            agentPersona: "GOSSIP_GIRL",
            summary: gossipResult.summary,
            keyFacts: gossipResult.keyFacts,
            sentiment: gossipSentimentLabel,
            sentimentData: gossipResult.sentiment,
            strategicThemes: gossipResult.strategicThemes,
            confidence: gossipResult.confidence,
            modelUsed: gossipResult.modelUsed,
            crossReferences: gossipResult.crossReferences ?? undefined,
          },
        });

        console.log(
          `    -> Gossip Girl done (confidence: ${gossipResult.confidence.toFixed(2)})`
        );

        await prisma.signal.update({
          where: { id: sig.id },
          data: { status: SignalStatus.ANALYZED },
        });

        analyzedCount++;
        dualResults.push({
          signalId: sig.id,
          companyId: sig.companyId,
          companyName: sig.companyName,
          analyst: analystResult as unknown as DualAgentResult["analyst"],
          gossipGirl: gossipResult as unknown as DualAgentResult["gossipGirl"],
        });

        if (i < scrapedSignals.length - 1) {
          await delay(DELAY_BETWEEN_LLM_CALLS_MS);
        }
      } catch (analysisError) {
        console.log(
          `    -> ANALYSIS FAILED: ${analysisError instanceof Error ? analysisError.message : String(analysisError)}`
        );
        await prisma.signal.update({
          where: { id: sig.id },
          data: { status: SignalStatus.FAILED },
        });
        analysisFailedCount++;
      }
    }

    console.log(
      `\n  Analysis complete: ${analyzedCount} signals analyzed, ${analysisFailedCount} failed.\n`
    );
  }

  // ─── 5. Summary ──────────────────────────────────────────────────────────
  console.log("=== Seed Complete ===");
  console.log(`  Users:              ${await prisma.user.count()}`);
  console.log(`  Companies:          ${await prisma.company.count()}`);
  console.log(`  Signals (total):    ${await prisma.signal.count()}`);
  console.log(`  Signals (bootstrap):${await prisma.signal.count({ where: { dataOrigin: DataOrigin.BOOTSTRAP } })}`);
  console.log(`  Analyses:           ${await prisma.analysis.count()}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
