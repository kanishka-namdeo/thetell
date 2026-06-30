import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";
import { analyzeSignalWithAgent } from "../src/lib/ai/agent/pipeline";
import type { AgentAnalysisInput } from "../src/lib/ai/agent/pipeline";
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from "../src/lib/ai/agent/personas";
import { extractSentimentLabel } from "../src/lib/ai/agent/types";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== PROCESS ALL PENDING SIGNALS ===\n");

  // Get all PENDING signals
  const pendingSignals = await prisma.signal.findMany({
    where: { status: "PENDING" },
    include: { company: true },
  });

  console.log(`Found ${pendingSignals.length} PENDING signals\n`);

  let successCount = 0;
  let failCount = 0;

  for (const signal of pendingSignals) {
    console.log(`\n[${successCount + failCount + 1}/${pendingSignals.length}] ${signal.title.slice(0, 60)}`);
    console.log(`  Content: ${signal.rawContent.length} chars`);

    const signalInput: AgentAnalysisInput = {
      id: signal.id,
      sourceUrl: signal.sourceUrl,
      sourceType: signal.sourceType as any,
      title: signal.title,
      rawContent: signal.rawContent,
      publishedAt: signal.publishedAt ? new Date(signal.publishedAt) : null,
      scrapedAt: new Date(signal.scrapedAt),
      companyId: signal.companyId,
      status: signal.status,
      engagement: null,
      metadata: null,
      company: signal.company
        ? {
            id: signal.company.id,
            name: signal.company.name,
            slug: signal.company.slug,
            ticker: signal.company.ticker,
          }
        : undefined,
    };

    try {
      // Update status to ANALYZING
      await prisma.signal.update({
        where: { id: signal.id },
        data: { status: "ANALYZING" },
      });

      // Run Analyst
      const analystAnalysis = await analyzeSignalWithAgent(signalInput, ANALYST_CONFIG);
      const analystSentimentLabel = extractSentimentLabel(analystAnalysis);

      await prisma.analysis.create({
        data: {
          id: analystAnalysis.id,
          signalId: signal.id,
          agentPersona: "ANALYST",
          summary: analystAnalysis.summary,
          keyFacts: analystAnalysis.keyFacts as any,
          sentiment: analystSentimentLabel,
          sentimentData: analystAnalysis.sentiment as any,
          strategicThemes: analystAnalysis.strategicThemes as any,
          confidence: analystAnalysis.confidence,
          modelUsed: analystAnalysis.modelUsed,
          analyzedAt: new Date(analystAnalysis.analyzedAt),
          sourceMatchPreference: true,
        },
      });

      // Run Gossip Girl
      const crossRefAnalyses = [
        {
          id: analystAnalysis.id,
          agentPersona: analystAnalysis.agentPersona,
          summary: analystAnalysis.summary,
          keyFacts: analystAnalysis.keyFacts.map((f) => ({ text: f.text })),
          sentiment: analystSentimentLabel,
          strategicThemes: analystAnalysis.strategicThemes.map((t) => ({ label: t.label })),
        },
      ];

      const gossipGirlAnalysis = await analyzeSignalWithAgent(
        signalInput,
        GOSSIP_GIRL_CONFIG,
        crossRefAnalyses
      );
      const gossipSentimentLabel = extractSentimentLabel(gossipGirlAnalysis);

      await prisma.analysis.create({
        data: {
          id: gossipGirlAnalysis.id,
          signalId: signal.id,
          agentPersona: "GOSSIP_GIRL",
          summary: gossipGirlAnalysis.summary,
          keyFacts: gossipGirlAnalysis.keyFacts as any,
          sentiment: gossipSentimentLabel,
          sentimentData: gossipGirlAnalysis.sentiment as any,
          strategicThemes: gossipGirlAnalysis.strategicThemes as any,
          confidence: gossipGirlAnalysis.confidence,
          modelUsed: gossipGirlAnalysis.modelUsed,
          crossReferences: gossipGirlAnalysis.crossReferences ?? undefined,
          analyzedAt: new Date(gossipGirlAnalysis.analyzedAt),
          sourceMatchPreference: false,
        },
      });

      // Update status to ANALYZED
      await prisma.signal.update({
        where: { id: signal.id },
        data: { status: "ANALYZED" },
      });

      console.log(`  ✓ SUCCESS - Analyst: ${analystAnalysis.confidence.toFixed(3)}, Gossip: ${gossipGirlAnalysis.confidence.toFixed(3)}`);
      successCount++;
    } catch (err: any) {
      console.log(`  ✗ FAILED: ${err.message}`);
      await prisma.signal.update({
        where: { id: signal.id },
        data: { status: "FAILED" },
      });
      failCount++;
    }
  }

  console.log(`\n=== COMPLETE ===`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);

  // Show final status counts
  const counts = await prisma.signal.groupBy({
    by: ["status"],
    _count: true,
  });

  console.log("\nSignal status counts:");
  for (const c of counts) {
    console.log(`  ${c.status}: ${c._count}`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);
