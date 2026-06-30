import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";
import * as dotenv from "dotenv";
import * as path from "path";
import { generateArticleWithAgent } from "../src/lib/ai/agent/article-generator";
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from "../src/lib/ai/agent/personas";
import type { AgentConfig } from "../src/lib/ai/agent/types";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const connectionString = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function generateArticlesForSignal(signalId: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing signal: ${signalId}`);
  console.log("=".repeat(60));

  // Load signal with analyses and company
  const signal = await prisma.signal.findUnique({
    where: { id: signalId },
    include: {
      analyses: {
        select: {
          id: true,
          agentPersona: true,
          summary: true,
          keyFacts: true,
          sentiment: true,
          strategicThemes: true,
          confidence: true,
        },
      },
      company: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!signal) {
    console.error(`Signal ${signalId} not found`);
    return;
  }

  if (!signal.company) {
    console.error(`Signal ${signalId} has no company`);
    return;
  }

  console.log(`\nSignal: ${signal.title}`);
  console.log(`Company: ${signal.company.name}`);
  console.log(`Analyses found: ${signal.analyses.length}`);

  // Generate articles for each agent persona
  const agents: Array<{ config: AgentConfig; name: string }> = [
    { config: ANALYST_CONFIG, name: "ANALYST" },
    { config: GOSSIP_GIRL_CONFIG, name: "GOSSIP_GIRL" },
  ];

  for (const agent of agents) {
    const analysis = signal.analyses.find((a) => a.agentPersona === agent.name);
    if (!analysis) {
      console.log(`\n  Skipping ${agent.name} - no analysis found`);
      continue;
    }

    console.log(`\n  Generating article for ${agent.name}...`);

    try {
      const articleInput = {
        companyId: signal.company.id,
        companyName: signal.company.name,
        analyses: [
          {
            summary: analysis.summary,
            keyFacts: (analysis.keyFacts as any[]) || [],
            sentiment: analysis.sentiment as string,
            strategicThemes: (analysis.strategicThemes as any[]) || [],
          },
        ],
        agentPersona: agent.name as "ANALYST" | "GOSSIP_GIRL",
        sourceType: signal.sourceType,
      };

      const article = await generateArticleWithAgent(
        articleInput,
        agent.config,
        undefined,
        "openai"
      );

      console.log(`  ✓ Article generated: ${article.title}`);
      console.log(`    Slug: ${article.slug}`);
      console.log(`    Summary length: ${article.summary.length} chars`);
      console.log(`    Body length: ${article.body.length} chars`);

      // Save article to database
      const savedArticle = await prisma.article.create({
        data: {
          title: article.title,
          slug: article.slug,
          summary: article.summary,
          body: article.body,
          agentPersona: agent.name as "ANALYST" | "GOSSIP_GIRL",
          analysisIds: [analysis.id],
          company: {
            connect: { id: signal.company!.id },
          },
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });

      console.log(`  ✓ Article saved to database: ${savedArticle.id}`);
    } catch (error) {
      console.error(`  ✗ Error generating article for ${agent.name}:`, error);
    }
  }
}

async function main() {
  console.log("Starting article generation for all analyzed signals...\n");

  // Get all signals with analyses
  const signalsWithAnalyses = await prisma.signal.findMany({
    where: { analyses: { some: {} } },
    select: { id: true },
  });

  console.log(`Found ${signalsWithAnalyses.length} signals with analyses`);

  // Generate articles for each signal
  for (const signal of signalsWithAnalyses) {
    await generateArticlesForSignal(signal.id);
  }

  // Count articles created
  const totalArticles = await prisma.article.count();
  console.log(`\n${"=".repeat(60)}`);
  console.log("ARTICLE GENERATION COMPLETE");
  console.log("=".repeat(60));
  console.log(`Total articles in database: ${totalArticles}`);

  // Sample a few articles
  const sampleArticles = await prisma.article.findMany({
    take: 3,
    select: {
      id: true,
      title: true,
      agentPersona: true,
      summary: true,
      company: {
        select: {
          name: true,
        },
      },
    },
  });

  console.log("\n=== SAMPLE ARTICLES ===");
  for (const article of sampleArticles) {
    console.log(`\nArticle: ${article.id}`);
    console.log(`  Title: ${article.title}`);
    console.log(`  Agent: ${article.agentPersona}`);
    console.log(`  Company: ${article.company?.name}`);
    console.log(`  Summary: ${article.summary.substring(0, 100)}...`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async (e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
