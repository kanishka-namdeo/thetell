import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";
import { analyzeSignalWithAgent } from "../src/lib/ai/agent/pipeline";
import type { AgentAnalysisInput } from "../src/lib/ai/agent/pipeline";
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from "../src/lib/ai/agent/personas";
import { extractSentimentLabel } from "../src/lib/ai/agent/types";
import { detectLanguage, LANGUAGE_CONFIDENCE_THRESHOLD } from "../src/lib/nlp";
import { assessContentQuality } from "../src/lib/nlp";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== TEST FULL INNGEST PIPELINE ===\n");

  // Get a FAILED signal
  const signal = await prisma.signal.findFirst({
    where: { status: "FAILED" },
    include: { company: true },
  });

  if (!signal) {
    console.log("No FAILED signals found");
    return;
  }

  console.log(`Testing signal: ${signal.id}`);
  console.log(`  Title: ${signal.title}`);
  console.log(`  Content length: ${signal.rawContent.length}`);
  console.log(`  Status: ${signal.status}\n`);

  // Step 1: Language detection
  console.log("Step 1: Language detection");
  try {
    const langResult = await detectLanguage(signal.rawContent);
    console.log(`  Language: ${langResult.language} (confidence: ${langResult.confidence})`);
    
    if (langResult.language !== "en" || langResult.confidence < LANGUAGE_CONFIDENCE_THRESHOLD) {
      console.log(`  ✗ Would be marked as NON_ENGLISH`);
      return;
    }
    console.log(`  ✓ Passed language check`);
  } catch (err: any) {
    console.log(`  ✗ Language detection failed: ${err.message}`);
  }

  // Step 2: Quality assessment
  console.log("\nStep 2: Quality assessment");
  try {
    const companyName = signal.company?.name ?? "";
    const qualityResult = await assessContentQuality(signal.rawContent, companyName);
    console.log(`  Score: ${qualityResult.score}`);
    console.log(`  Pass: ${qualityResult.pass}`);
    console.log(`  Reasons: ${qualityResult.reasons.join(", ")}`);
    
    if (!qualityResult.pass) {
      console.log(`  ✗ Would be marked as LOW_QUALITY`);
      return;
    }
    console.log(`  ✓ Passed quality check`);
  } catch (err: any) {
    console.log(`  ✗ Quality assessment failed: ${err.message}`);
  }

  // Step 3: Run analysis
  console.log("\nStep 3: Run dual-agent analysis");
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

  let analystAnalysis = null;
  try {
    console.log("  Running Analyst...");
    const start = Date.now();
    analystAnalysis = await analyzeSignalWithAgent(signalInput, ANALYST_CONFIG);
    console.log(`  ✓ Analyst SUCCESS (${Date.now() - start}ms)`);
    console.log(`    Confidence: ${analystAnalysis.confidence}`);
    console.log(`    Facts: ${analystAnalysis.keyFacts.length}`);
  } catch (err: any) {
    console.log(`  ✗ Analyst FAILED: ${err.message}`);
    if (err.stack) {
      console.log(`    Stack: ${err.stack.split("\n").slice(0, 3).join("\n")}`);
    }
  }

  let gossipAnalysis = null;
  try {
    console.log("  Running Gossip Girl...");
    const start = Date.now();
    gossipAnalysis = await analyzeSignalWithAgent(signalInput, GOSSIP_GIRL_CONFIG);
    console.log(`  ✓ Gossip Girl SUCCESS (${Date.now() - start}ms)`);
    console.log(`    Confidence: ${gossipAnalysis.confidence}`);
    console.log(`    Facts: ${gossipAnalysis.keyFacts.length}`);
  } catch (err: any) {
    console.log(`  ✗ Gossip Girl FAILED: ${err.message}`);
  }

  // Step 4: Try to write to DB
  if (analystAnalysis) {
    console.log("\nStep 4: Write Analyst analysis to DB");
    try {
      const sentimentLabel = extractSentimentLabel(analystAnalysis);
      console.log(`  Sentiment label: ${sentimentLabel}`);
      
      await prisma.analysis.create({
        data: {
          id: analystAnalysis.id,
          signalId: signal.id,
          agentPersona: "ANALYST",
          summary: analystAnalysis.summary,
          keyFacts: analystAnalysis.keyFacts as any,
          sentiment: sentimentLabel,
          sentimentData: analystAnalysis.sentiment as any,
          strategicThemes: analystAnalysis.strategicThemes as any,
          confidence: analystAnalysis.confidence,
          modelUsed: analystAnalysis.modelUsed,
          analyzedAt: new Date(analystAnalysis.analyzedAt),
          sourceMatchPreference: true,
        },
      });
      console.log(`  ✓ Analysis record created`);
    } catch (err: any) {
      console.log(`  ✗ DB write FAILED: ${err.message}`);
      if (err.stack) {
        console.log(`    Stack: ${err.stack.split("\n").slice(0, 3).join("\n")}`);
      }
    }
  }

  console.log("\n=== PIPELINE TEST COMPLETE ===");

  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);
