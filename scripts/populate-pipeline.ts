/**
 * Populate the full pipeline: analyze unanalyzed signals, generate articles, debates, and correlations.
 * 
 * This script:
 * 1. Finds all signals without analyses
 * 2. Runs dual-agent analysis (Analyst + Gossip Girl) for each
 * 3. Generates articles for both agents
 * 4. Generates debates
 * 5. Runs correlation engine for inferences
 * 
 * Usage: pnpm tsx scripts/populate-pipeline.ts
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { analyzeSignalWithAgent } from '../src/lib/ai/agent/pipeline';
import { generateArticleWithAgent } from '../src/lib/ai/agent/article-generator';
import { generateDebate } from '../src/lib/ai/agent/debate';
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from '../src/lib/ai/agent/personas';
import { extractSentimentLabel } from '../src/lib/ai/agent/types';
import type { CrossRefAnalysis, AgentAnalysisInput } from '../src/lib/ai/agent/pipeline';
import type { AgentAnalysis } from '../src/lib/ai/agent/types';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function analyzeSignal(signal: any) {
  const signalInput: AgentAnalysisInput = {
    id: signal.id,
    sourceUrl: signal.sourceUrl,
    sourceType: signal.sourceType,
    title: signal.title,
    rawContent: signal.rawContent,
    publishedAt: signal.publishedAt,
    scrapedAt: signal.scrapedAt,
    companyId: signal.companyId,
    status: signal.status,
    company: signal.company
      ? {
          id: signal.company.id,
          name: signal.company.name,
          slug: signal.company.slug,
          ticker: signal.company.ticker,
        }
      : undefined,
  };

  console.log(`  Running Analyst analysis...`);
  const analystAnalysis = await analyzeSignalWithAgent(signalInput, ANALYST_CONFIG);
  console.log(`  ✓ Analyst analysis complete (confidence: ${(analystAnalysis.confidence * 100).toFixed(1)}%)`);

  const analystSentimentLabel = extractSentimentLabel(analystAnalysis);
  await prisma.analysis.create({
    data: {
      id: analystAnalysis.id,
      signalId: signal.id,
      agentPersona: "ANALYST",
      summary: analystAnalysis.summary,
      keyFacts: analystAnalysis.keyFacts,
      sentiment: analystSentimentLabel,
      sentimentData: analystAnalysis.sentiment,
      strategicThemes: analystAnalysis.strategicThemes,
      confidence: analystAnalysis.confidence,
      modelUsed: analystAnalysis.modelUsed,
      analyzedAt: new Date(analystAnalysis.analyzedAt),
    },
  });

  console.log(`  Running Gossip Girl analysis...`);
  const crossRefAnalyses: CrossRefAnalysis[] = [
    {
      id: analystAnalysis.id,
      agentPersona: analystAnalysis.agentPersona,
      summary: analystAnalysis.summary,
      keyFacts: analystAnalysis.keyFacts.map((f) => ({ text: f.text })),
      sentiment: "sentiment" in analystAnalysis.sentiment
        ? analystAnalysis.sentiment.sentiment
        : "NEUTRAL",
      strategicThemes: analystAnalysis.strategicThemes.map((t) => ({ label: t.label })),
    },
  ];

  const gossipGirlAnalysis = await analyzeSignalWithAgent(
    signalInput,
    GOSSIP_GIRL_CONFIG,
    crossRefAnalyses
  );
  console.log(`  ✓ Gossip Girl analysis complete (confidence: ${(gossipGirlAnalysis.confidence * 100).toFixed(1)}%)`);

  const gossipSentimentLabel = extractSentimentLabel(gossipGirlAnalysis);
  await prisma.analysis.create({
    data: {
      id: gossipGirlAnalysis.id,
      signalId: signal.id,
      agentPersona: "GOSSIP_GIRL",
      summary: gossipGirlAnalysis.summary,
      keyFacts: gossipGirlAnalysis.keyFacts,
      sentiment: gossipSentimentLabel,
      sentimentData: gossipGirlAnalysis.sentiment,
      strategicThemes: gossipGirlAnalysis.strategicThemes,
      confidence: gossipGirlAnalysis.confidence,
      modelUsed: gossipGirlAnalysis.modelUsed,
      crossReferences: gossipGirlAnalysis.crossReferences ?? undefined,
      analyzedAt: new Date(gossipGirlAnalysis.analyzedAt),
    },
  });

  return { analystAnalysis, gossipGirlAnalysis };
}

async function generateArticles(signal: any, analystAnalysis: AgentAnalysis, gossipGirlAnalysis: AgentAnalysis) {
  console.log(`  Generating Analyst article...`);
  const analystArticle = await generateArticleWithAgent(
    {
      companyId: signal.companyId,
      companyName: signal.company?.name ?? "Unknown",
      analyses: [
        {
          summary: analystAnalysis.summary,
          keyFacts: analystAnalysis.keyFacts.map((f) => ({ text: f.text })),
          sentiment: "sentiment" in analystAnalysis.sentiment
            ? analystAnalysis.sentiment.sentiment
            : "NEUTRAL",
          strategicThemes: analystAnalysis.strategicThemes.map((t) => ({ label: t.label })),
        },
      ],
    },
    ANALYST_CONFIG,
    [
      {
        summary: gossipGirlAnalysis.summary,
        agentPersona: gossipGirlAnalysis.agentPersona,
        keyFacts: gossipGirlAnalysis.keyFacts.map((f) => f.text),
      },
    ]
  );

  await prisma.article.create({
    data: {
      title: analystArticle.title,
      slug: analystArticle.slug,
      summary: analystArticle.summary,
      body: analystArticle.body,
      companyId: signal.companyId,
      agentPersona: "ANALYST",
      analysisIds: [analystAnalysis.id],
      status: "PUBLISHED",
    },
  });
  console.log(`  ✓ Analyst article created: ${analystArticle.title.substring(0, 60)}...`);

  console.log(`  Generating Gossip Girl article...`);
  const gossipArticle = await generateArticleWithAgent(
    {
      companyId: signal.companyId,
      companyName: signal.company?.name ?? "Unknown",
      analyses: [
        {
          summary: gossipGirlAnalysis.summary,
          keyFacts: gossipGirlAnalysis.keyFacts.map((f) => ({ text: f.text })),
          sentiment: "surface_reading" in gossipGirlAnalysis.sentiment
            ? ({ "bullish-spin": "POSITIVE", "bearish-subtext": "NEGATIVE", "neutral-surface": "NEUTRAL", "mixed-signals": "NEUTRAL" } as Record<string, string>)[gossipGirlAnalysis.sentiment.surface_reading] ?? "NEUTRAL"
            : "NEUTRAL",
          strategicThemes: gossipGirlAnalysis.strategicThemes.map((t) => ({ label: t.label })),
        },
      ],
    },
    GOSSIP_GIRL_CONFIG,
    [
      {
        summary: analystAnalysis.summary,
        agentPersona: analystAnalysis.agentPersona,
        keyFacts: analystAnalysis.keyFacts.map((f) => f.text),
      },
    ]
  );

  await prisma.article.create({
    data: {
      title: gossipArticle.title,
      slug: gossipArticle.slug,
      summary: gossipArticle.summary,
      body: gossipArticle.body,
      companyId: signal.companyId,
      agentPersona: "GOSSIP_GIRL",
      analysisIds: [gossipGirlAnalysis.id],
      status: "PUBLISHED",
    },
  });
  console.log(`  ✓ Gossip Girl article created: ${gossipArticle.title.substring(0, 60)}...`);
}

async function generateDebateRecord(signalId: string, analystAnalysis: AgentAnalysis, gossipGirlAnalysis: AgentAnalysis) {
  console.log(`  Generating debate...`);
  const debate = await generateDebate(analystAnalysis, gossipGirlAnalysis);

  await prisma.agentDebate.create({
    data: {
      signalId,
      analystPosition: debate.analystPosition,
      gossipGirlPosition: debate.gossipGirlPosition,
      pointsOfAgreement: debate.pointsOfAgreement,
      pointsOfContention: debate.pointsOfContention,
      synthesis: debate.synthesis,
    },
  });
  console.log(`  ✓ Debate created`);
}

async function main() {
  console.log("=== POPULATING FULL PIPELINE ===\n");

  const unanalyzedSignals = await prisma.signal.findMany({
    where: { analyses: { none: {} } },
    include: { company: true },
  });

  console.log(`Found ${unanalyzedSignals.length} signals without analysis\n`);

  let analyzedCount = 0;
  let articlesCount = 0;
  let debatesCount = 0;
  let failedCount = 0;

  for (let i = 0; i < unanalyzedSignals.length; i++) {
    const signal = unanalyzedSignals[i];
    const progress = `[${i + 1}/${unanalyzedSignals.length}]`;

    console.log(`${progress} Processing: ${signal.title.substring(0, 60)}...`);

    try {
      const { analystAnalysis, gossipGirlAnalysis } = await analyzeSignal(signal);
      analyzedCount++;

      await generateArticles(signal, analystAnalysis, gossipGirlAnalysis);
      articlesCount += 2;

      await generateDebateRecord(signal.id, analystAnalysis, gossipGirlAnalysis);
      debatesCount++;

      await prisma.signal.update({
        where: { id: signal.id },
        data: { status: "ANALYZED" },
      });

      console.log(`  ✓ Signal fully processed\n`);
    } catch (error) {
      console.error(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}\n`);
      failedCount++;
    }
  }

  console.log("\n=== ANALYSIS PHASE COMPLETE ===");
  console.log(`Signals analyzed: ${analyzedCount}`);
  console.log(`Articles generated: ${articlesCount}`);
  console.log(`Debates generated: ${debatesCount}`);
  console.log(`Failed: ${failedCount}`);

  console.log("\n=== RUNNING CORRELATION ENGINE ===");
  console.log("See scripts/run-correlation.ts for correlation step\n");

  const finalCounts = {
    signals: await prisma.signal.count(),
    analyses: await prisma.analysis.count(),
    articles: await prisma.article.count(),
    debates: await prisma.agentDebate.count(),
  };

  console.log("=== FINAL DB STATE ===");
  console.log(JSON.stringify(finalCounts, null, 2));

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  });
