/**
 * Real-data seed script (dual-agent).
 *
 * Scrapes real public URLs, runs the dual-agent AI analysis pipeline
 * (Analyst + Gossip Girl), and generates articles in both voices.
 *
 * Run with: pnpm dlx tsx prisma/seed-real.ts
 */

import "dotenv/config";
import { PrismaClient, SourceType, SignalStatus, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { NewsScraper } from "../src/lib/scraping/news-scraper";
import { analyzeSignalWithAgent } from "../src/lib/ai/agent/pipeline";
import type { CrossRefAnalysis } from "../src/lib/ai/agent/pipeline";
import { generateArticleWithAgent } from "../src/lib/ai/agent/article-generator";
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from "../src/lib/ai/agent/personas";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const DELAY_BETWEEN_LLM_CALLS_MS = 2500;

interface SignalDef {
  url: string;
  companySlug: "apple" | "tesla" | "nvidia" | "microsoft";
  sourceType: SourceType;
  fallbackUrls?: string[];
}

const SIGNAL_DEFS: SignalDef[] = [
  // Tesla (5) - Teslarati (real URLs from 2026-06-18)
  {
    url: "https://www.teslarati.com/tesla-full-self-driving-parking-upgrade-elon-musk/",
    companySlug: "tesla",
    sourceType: SourceType.NEWS,
  },
  {
    url: "https://www.teslarati.com/tesla-full-self-driving-app-connectivity-save-life-medical-emergency/",
    companySlug: "tesla",
    sourceType: SourceType.NEWS,
  },
  {
    url: "https://www.teslarati.com/elon-musk-grok-hollywood-movies-2026/",
    companySlug: "tesla",
    sourceType: SourceType.NEWS,
  },
  {
    url: "https://www.teslarati.com/tesla-patent-improve-common-on-road-complaint/",
    companySlug: "tesla",
    sourceType: SourceType.NEWS,
  },
  {
    url: "https://www.teslarati.com/tesla-cybercab-texas-dot-official-support/",
    companySlug: "tesla",
    sourceType: SourceType.NEWS,
  },
  // NVIDIA (5) - blogs.nvidia.com (real URLs from 2026-06-18)
  {
    url: "https://blogs.nvidia.com/blog/coherent-texas-ai-optical/",
    companySlug: "nvidia",
    sourceType: SourceType.BLOG,
  },
  {
    url: "https://blogs.nvidia.com/blog/blackwell-mlperf-training-6-0/",
    companySlug: "nvidia",
    sourceType: SourceType.BLOG,
  },
  {
    url: "https://blogs.nvidia.com/blog/nvidia-blackwell-agentperf-artificial-analysis/",
    companySlug: "nvidia",
    sourceType: SourceType.BLOG,
  },
  {
    url: "https://blogs.nvidia.com/blog/rtx-ai-garage-local-gemma-diffusion/",
    companySlug: "nvidia",
    sourceType: SourceType.BLOG,
  },
  {
    url: "https://blogs.nvidia.com/blog/nvidia-xr-ai/",
    companySlug: "nvidia",
    sourceType: SourceType.BLOG,
  },
  // Microsoft (5) - news.microsoft.com and blogs.microsoft.com
  {
    url: "https://news.microsoft.com/microsoft-builds-ai-infrastructure-for-the-future/",
    companySlug: "microsoft",
    sourceType: SourceType.NEWS,
  },
  {
    url: "https://blogs.microsoft.com/blog/2026/06/10/microsoft-ai-enterprise-transformation/",
    companySlug: "microsoft",
    sourceType: SourceType.BLOG,
  },
  {
    url: "https://news.microsoft.com/source/features/ai/microsoft-copilot-studio-enterprise/",
    companySlug: "microsoft",
    sourceType: SourceType.NEWS,
  },
  {
    url: "https://blogs.microsoft.com/blog/2026/06/08/azure-ai-services-expansion/",
    companySlug: "microsoft",
    sourceType: SourceType.BLOG,
  },
  {
    url: "https://news.microsoft.com/source/features/ai/microsoft-openai-parttlement-evolution/",
    companySlug: "microsoft",
    sourceType: SourceType.NEWS,
  },
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== Seeding database with REAL data (dual-agent) ===\n");

  // 1. Ensure users exist
  console.log("Step 1: Ensuring users exist...");
  const passwordHash = await bcrypt.hash("password123", 10);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@thetell.com" },
    update: {},
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
    update: {},
    create: {
      email: "analyst@thetell.com",
      name: "Test Analyst",
      passwordHash,
      role: Role.USER,
      emailVerified: new Date(),
    },
  });
  console.log("  Users ready.\n");

  // 2. Ensure companies exist
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
  const microsoft = await prisma.company.findUnique({ where: { slug: "microsoft" } });

  if (!apple || !tesla || !nvidia || !microsoft) {
    throw new Error("Failed to find companies after upsert");
  }

  const companyMap: Record<string, { id: string; name: string }> = {
    apple,
    tesla,
    nvidia,
    microsoft,
  };
  console.log("  Companies ready.\n");

  // 3. Scrape, dual-agent analyze, and create signals
  const scraper = new NewsScraper();
  let scrapedCount = 0;
  let analyzedCount = 0;
  let failedCount = 0;

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
      crossReferences: unknown;
    };
  }

  const dualResults: DualAgentResult[] = [];

  for (let i = 0; i < SIGNAL_DEFS.length; i++) {
    const def = SIGNAL_DEFS[i];
    const company = companyMap[def.companySlug];

    console.log(
      `[${i + 1}/${SIGNAL_DEFS.length}] Processing: ${def.url}`
    );

    // Skip if signal already exists (idempotent)
    const existing = await prisma.signal.findFirst({
      where: { sourceUrl: def.url },
    });
    if (existing) {
      console.log("  -> Already exists, skipping.");
      if (existing.status === SignalStatus.ANALYZED) {
        const existingAnalyst = await prisma.analysis.findUnique({
          where: { signalId_agentPersona: { signalId: existing.id, agentPersona: "ANALYST" } },
        });
        const existingGossip = await prisma.analysis.findUnique({
          where: { signalId_agentPersona: { signalId: existing.id, agentPersona: "GOSSIP_GIRL" } },
        });
        if (existingAnalyst && existingGossip) {
          dualResults.push({
            signalId: existing.id,
            companyId: existing.companyId,
            companyName: company.name,
            analyst: existingAnalyst as unknown as DualAgentResult["analyst"],
            gossipGirl: existingGossip as unknown as DualAgentResult["gossipGirl"],
          });
        }
      }
      continue;
    }

    // Scrape - try primary URL first, then fallbacks
    try {
      const urlsToTry = [def.url, ...(def.fallbackUrls || [])];
      let article: Awaited<ReturnType<typeof scraper.scrapeArticle>> | null = null;
      let usedUrl = def.url;

      for (const urlToTry of urlsToTry) {
        try {
          console.log(`  Scraping: ${urlToTry}`);
          article = await scraper.scrapeArticle(urlToTry);
          if (article && article.bodyText && article.bodyText.length >= 200) {
            usedUrl = urlToTry;
            console.log(
              `  -> Scraped: "${article.title.slice(0, 60)}..." (${article.bodyText.length} chars)`
            );
            scrapedCount++;
            break;
          } else {
            console.log(
              `  -> Insufficient content (${article?.bodyText.length ?? 0} chars), trying next...`
            );
            article = null;
          }
        } catch (urlError) {
          console.log(
            `  -> Scrape failed: ${urlError instanceof Error ? urlError.message : String(urlError)}`
          );
          article = null;
        }
      }

      if (!article || !article.bodyText || article.bodyText.length < 200) {
        console.log(`  -> FAILED: All URLs exhausted for this signal`);
        failedCount++;
        continue;
      }

      // Create signal record
      const signal = await prisma.signal.create({
        data: {
          sourceUrl: def.url,
          sourceType: def.sourceType,
          title: article.title || "Untitled",
          rawContent: article.bodyText,
          publishedAt: article.publishedAt,
          companyId: company.id,
          status: SignalStatus.PENDING,
        },
      });

      // Dual-agent analysis
      await prisma.signal.update({
        where: { id: signal.id },
        data: { status: SignalStatus.ANALYZING },
      });

      try {
        const signalInput = {
          id: signal.id,
          sourceUrl: signal.sourceUrl,
          sourceType: signal.sourceType as "NEWS" | "FILING" | "TRANSCRIPT" | "SOCIAL" | "BLOG" | "JOB_POSTING",
          title: signal.title,
          rawContent: signal.rawContent,
          publishedAt: signal.publishedAt,
          scrapedAt: signal.scrapedAt,
          companyId: signal.companyId,
          status: signal.status,
          company: {
            id: company.id,
            name: company.name,
            slug: def.companySlug,
            ticker: null,
          },
        };

        // Run Analyst agent first
        console.log("  Running Analyst agent...");
        const analystResult = await analyzeSignalWithAgent(
          signalInput,
          ANALYST_CONFIG,
          undefined,
          "openai"
        );

        // Extract simple sentiment label for DB enum field
        const analystSentimentLabel = "sentiment" in analystResult.sentiment
          ? analystResult.sentiment.sentiment
          : "NEUTRAL";

        await prisma.analysis.create({
          data: {
            id: analystResult.id,
            signalId: signal.id,
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
          `  -> Analyst done (confidence: ${analystResult.confidence.toFixed(2)}, sentiment: ${analystSentimentLabel})`
        );

        await delay(DELAY_BETWEEN_LLM_CALLS_MS);

        // Run Gossip Girl agent with cross-reference to Analyst
        console.log("  Running Gossip Girl agent...");
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

        const gossipResult = await analyzeSignalWithAgent(
          signalInput,
          GOSSIP_GIRL_CONFIG,
          crossRefAnalyses,
          "openai"
        );

        // Map Gossip Girl sentiment to the Sentiment enum
        const gossipSentimentLabel = "surface_reading" in gossipResult.sentiment
          ? ({ "bullish-spin": "POSITIVE", "bearish-subtext": "NEGATIVE", "neutral-surface": "NEUTRAL", "mixed-signals": "NEUTRAL" } as Record<string, "POSITIVE" | "NEGATIVE" | "NEUTRAL">)[gossipResult.sentiment.surface_reading] ?? "NEUTRAL"
          : "NEUTRAL";

        await prisma.analysis.create({
          data: {
            id: gossipResult.id,
            signalId: signal.id,
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
          `  -> Gossip Girl done (confidence: ${gossipResult.confidence.toFixed(2)}, surface_reading: ${"surface_reading" in gossipResult.sentiment ? gossipResult.sentiment.surface_reading : "N/A"})`
        );

        await prisma.signal.update({
          where: { id: signal.id },
          data: { status: SignalStatus.ANALYZED },
        });

        analyzedCount++;

        dualResults.push({
          signalId: signal.id,
          companyId: company.id,
          companyName: company.name,
          analyst: analystResult as unknown as DualAgentResult["analyst"],
          gossipGirl: gossipResult as unknown as DualAgentResult["gossipGirl"],
        });

        if (i < SIGNAL_DEFS.length - 1) {
          console.log(
            `  Waiting ${DELAY_BETWEEN_LLM_CALLS_MS / 1000}s before next...`
          );
          await delay(DELAY_BETWEEN_LLM_CALLS_MS);
        }
      } catch (analysisError) {
        console.log(
          `  -> ANALYSIS FAILED: ${analysisError instanceof Error ? analysisError.message : String(analysisError)}`
        );
        await prisma.signal.update({
          where: { id: signal.id },
          data: { status: SignalStatus.FAILED },
        });
        failedCount++;
      }
    } catch (scrapeError) {
      console.log(
        `  -> SCRAPE FAILED: ${scrapeError instanceof Error ? scrapeError.message : String(scrapeError)}`
      );
      failedCount++;
    }

    console.log();
  }

  // 4. Generate dual-agent articles per company
  console.log("Step 4: Generating dual-agent articles...");
  let articlesGenerated = 0;

  const grouped = new Map<
    string,
    { companyName: string; results: typeof dualResults }
  >();
  for (const r of dualResults) {
    if (!grouped.has(r.companyId)) {
      grouped.set(r.companyId, {
        companyName: r.companyName,
        results: [],
      });
    }
    grouped.get(r.companyId)!.results.push(r);
  }

  for (const [companyId, group] of grouped) {
    if (group.results.length < 2) {
      console.log(
        `  ${group.companyName}: Only ${group.results.length} analysis(es), need 2+ for article. Skipping.`
      );
      continue;
    }

    const analysesInput = group.results.map((r) => ({
      summary: r.analyst.summary,
      keyFacts: r.analyst.keyFacts as Array<{ text: string }>,
      sentiment: r.analyst.sentiment,
      strategicThemes: r.analyst.strategicThemes as Array<{ label: string }>,
    }));

    // Generate Analyst article
    console.log(
      `\n  Generating Analyst article for ${group.companyName} (${group.results.length} signals)...`
    );

    try {
      const gossipCrossRefForAnalyst = group.results.map((r) => ({
        summary: r.gossipGirl.summary,
        agentPersona: "GOSSIP_GIRL",
        keyFacts: r.gossipGirl.keyFacts.map((f) => f.text),
      }));

      const analystArticle = await generateArticleWithAgent(
        {
          companyId,
          companyName: group.companyName,
          analyses: analysesInput,
        },
        ANALYST_CONFIG,
        gossipCrossRefForAnalyst,
        "openai"
      );

      await prisma.article.create({
        data: {
          title: analystArticle.title,
          slug: analystArticle.slug,
          summary: analystArticle.summary,
          body: analystArticle.body,
          companyId,
          agentPersona: "ANALYST",
          analysisIds: group.results.map((r) => r.signalId),
          status: "PUBLISHED",
          authorId: adminUser.id,
          publishedAt: new Date(),
        },
      });

      console.log(`  -> Analyst article: "${analystArticle.title}"`);
      articlesGenerated++;
      await delay(DELAY_BETWEEN_LLM_CALLS_MS);
    } catch (articleError) {
      console.log(
        `  -> ANALYST ARTICLE FAILED: ${articleError instanceof Error ? articleError.message : String(articleError)}`
      );
    }

    // Generate Gossip Girl article
    console.log(
      `  Generating Gossip Girl article for ${group.companyName}...`
    );

    try {
      const gossipAnalysesInput = group.results.map((r) => ({
        summary: r.gossipGirl.summary,
        keyFacts: r.gossipGirl.keyFacts as Array<{ text: string }>,
        sentiment: r.gossipGirl.sentiment,
        strategicThemes: r.gossipGirl.strategicThemes as Array<{ label: string }>,
      }));

      const analystCrossRefForGossip = group.results.map((r) => ({
        summary: r.analyst.summary,
        agentPersona: "ANALYST",
        keyFacts: r.analyst.keyFacts.map((f) => f.text),
      }));

      const gossipArticle = await generateArticleWithAgent(
        {
          companyId,
          companyName: group.companyName,
          analyses: gossipAnalysesInput,
        },
        GOSSIP_GIRL_CONFIG,
        analystCrossRefForGossip,
        "openai"
      );

      await prisma.article.create({
        data: {
          title: gossipArticle.title,
          slug: gossipArticle.slug,
          summary: gossipArticle.summary,
          body: gossipArticle.body,
          companyId,
          agentPersona: "GOSSIP_GIRL",
          analysisIds: group.results.map((r) => r.signalId),
          status: "PUBLISHED",
          authorId: adminUser.id,
          publishedAt: new Date(),
        },
      });

      console.log(`  -> Gossip Girl article: "${gossipArticle.title}"`);
      articlesGenerated++;
      await delay(DELAY_BETWEEN_LLM_CALLS_MS);
    } catch (articleError) {
      console.log(
        `  -> GOSSIP GIRL ARTICLE FAILED: ${articleError instanceof Error ? articleError.message : String(articleError)}`
      );
    }
  }

  // 5. Summary
  console.log("\n=== Seed Complete ===");
  console.log(`  Scraped:   ${scrapedCount}`);
  console.log(`  Analyzed:  ${analyzedCount} (dual-agent: ${analyzedCount * 2} analyses)`);
  console.log(`  Failed:    ${failedCount}`);
  console.log(`  Articles:  ${articlesGenerated} (Analyst + Gossip Girl)`);
  console.log(`  Total signals: ${await prisma.signal.count()}`);
  console.log(`  Total analyses: ${await prisma.analysis.count()}`);
  console.log(`  Total articles: ${await prisma.article.count()}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
