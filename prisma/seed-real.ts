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
  companySlug: "apple" | "tesla" | "nvidia";
  sourceType: SourceType;
}

const SIGNAL_DEFS: SignalDef[] = [
  // Apple (3) - using tech news sites that allow scraping
  {
    url: "https://www.macrumors.com/2025/02/19/apple-iphone-16e-official/",
    companySlug: "apple",
    sourceType: SourceType.NEWS,
  },
  {
    url: "https://9to5mac.com/2025/10/30/apple-vision-pro-m5-chip/",
    companySlug: "apple",
    sourceType: SourceType.NEWS,
  },
  {
    url: "https://www.macrumors.com/2025/09/15/apple-ios-26-available-today/",
    companySlug: "apple",
    sourceType: SourceType.NEWS,
  },
  // Tesla (3) - using tech news sites
  {
    url: "https://electrek.co/2025/01/29/tesla-q4-2024-earnings-results/",
    companySlug: "tesla",
    sourceType: SourceType.NEWS,
  },
  {
    url: "https://electrek.co/2024/10/23/tesla-q3-2024-earnings-results/",
    companySlug: "tesla",
    sourceType: SourceType.NEWS,
  },
  {
    url: "https://electrek.co/2024/07/02/tesla-q2-2024-production-deliveries-deployments/",
    companySlug: "tesla",
    sourceType: SourceType.NEWS,
  },
  // NVIDIA (4) - nvidianews works
  {
    url: "https://nvidianews.nvidia.com/news/openai-and-nvidia-announce-strategic-partnership-to-deploy-10gw-of-nvidia-systems",
    companySlug: "nvidia",
    sourceType: SourceType.NEWS,
  },
  {
    url: "https://nvidianews.nvidia.com/news/nvidia-oracle-us-department-of-energy-ai-supercomputer-scientific-discovery",
    companySlug: "nvidia",
    sourceType: SourceType.NEWS,
  },
  {
    url: "https://nvidianews.nvidia.com/news/nvidia-unveils-rubin-cpx-a-new-class-of-gpu-designed-for-massive-context-inference",
    companySlug: "nvidia",
    sourceType: SourceType.NEWS,
  },
  {
    url: "https://nvidianews.nvidia.com/news/nvidia-debuts-nemotron-3-family-of-open-models",
    companySlug: "nvidia",
    sourceType: SourceType.BLOG,
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

  if (!apple || !tesla || !nvidia) {
    throw new Error("Failed to find companies after upsert");
  }

  const companyMap: Record<string, { id: string; name: string }> = {
    apple,
    tesla,
    nvidia,
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

    // Scrape
    try {
      console.log("  Scraping...");
      const article = await scraper.scrapeArticle(def.url);

      if (!article || !article.bodyText || article.bodyText.length < 200) {
        console.log(
          `  -> FAILED: Insufficient content (${article?.bodyText.length ?? 0} chars)`
        );
        failedCount++;
        continue;
      }

      console.log(
        `  -> Scraped: "${article.title.slice(0, 60)}..." (${article.bodyText.length} chars)`
      );
      scrapedCount++;

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

        await prisma.analysis.create({
          data: {
            id: analystResult.id,
            signalId: signal.id,
            agentPersona: "ANALYST",
            summary: analystResult.summary,
            keyFacts: analystResult.keyFacts,
            sentiment: analystResult.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL",
            strategicThemes: analystResult.strategicThemes,
            confidence: analystResult.confidence,
            modelUsed: analystResult.modelUsed,
          },
        });

        console.log(
          `  -> Analyst done (confidence: ${analystResult.confidence.toFixed(2)}, sentiment: ${analystResult.sentiment})`
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
            sentiment: analystResult.sentiment,
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

        await prisma.analysis.create({
          data: {
            id: gossipResult.id,
            signalId: signal.id,
            agentPersona: "GOSSIP_GIRL",
            summary: gossipResult.summary,
            keyFacts: gossipResult.keyFacts,
            sentiment: gossipResult.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL",
            strategicThemes: gossipResult.strategicThemes,
            confidence: gossipResult.confidence,
            modelUsed: gossipResult.modelUsed,
            crossReferences: gossipResult.crossReferences ?? undefined,
          },
        });

        console.log(
          `  -> Gossip Girl done (confidence: ${gossipResult.confidence.toFixed(2)}, sentiment: ${gossipResult.sentiment})`
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
