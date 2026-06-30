/**
 * Live diagnostic: run dual-agent analysis on a real signal from the DB.
 * Captures errors at each step with full context.
 */
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
  console.log("=== DUAL-AGENT ANALYSIS LIVE TEST ===\n");

  // 1. Check env vars
  console.log("--- Environment Check ---");
  console.log(`  API_KEY set: ${!!process.env.API_KEY}`);
  console.log(`  BASE_URL set: ${!!process.env.BASE_URL}`);
  console.log(`  FAST_MODEL: ${process.env.FAST_MODEL || "NOT SET"}`);
  console.log(`  DATABASE_URL set: ${!!process.env.DATABASE_URL}`);

  // 2. Find a signal with content
  console.log("\n--- Finding Signals ---");
  const signals = await prisma.signal.findMany({
    where: {
      rawContent: { not: "" },
    },
    include: { company: true },
    orderBy: { scrapedAt: "desc" },
    take: 5,
  });

  if (signals.length === 0) {
    console.log("No signals found in database!");
    return;
  }

  console.log(`Found ${signals.length} signals:`);
  for (const s of signals) {
    console.log(`  [${s.status}] ${s.sourceType} | ${s.title.slice(0, 60)} | content: ${s.rawContent.length} chars | company: ${s.company?.name || "none"}`);
  }

  // Pick the first signal with decent content
  const signal = signals.find(s => s.rawContent.length > 100) || signals[0];
  console.log(`\n--- Testing with signal: ${signal.id} ---`);
  console.log(`  Title: ${signal.title}`);
  console.log(`  Source: ${signal.sourceType}`);
  console.log(`  Content length: ${signal.rawContent.length}`);
  console.log(`  Company: ${signal.company?.name || "none"}`);

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

  // 3. Run Analyst
  console.log("\n--- Analyst Analysis ---");
  let analystResult = null;
  try {
    const start = Date.now();
    analystResult = await analyzeSignalWithAgent(signalInput, ANALYST_CONFIG);
    const elapsed = Date.now() - start;
    console.log(`  SUCCESS (${elapsed}ms)`);
    console.log(`  Confidence: ${analystResult.confidence}`);
    console.log(`  Summary: ${analystResult.summary.slice(0, 120)}...`);
    console.log(`  Facts: ${analystResult.keyFacts.length}`);
    console.log(`  Themes: ${analystResult.strategicThemes.length}`);
    console.log(`  Sentiment: ${JSON.stringify(analystResult.sentiment)}`);
    console.log(`  Source match: ${analystResult.sourceMatchPreference}`);
    console.log(`  Model: ${analystResult.modelUsed}`);
  } catch (err: any) {
    console.log(`  FAILED: ${err.message}`);
    if (err.issues) {
      console.log(`  Zod issues: ${JSON.stringify(err.issues, null, 2)}`);
    }
    if (err.stack) {
      console.log(`  Stack: ${err.stack.split("\n").slice(0, 5).join("\n")}`);
    }
  }

  // 4. Run Gossip Girl (with cross-ref to Analyst if available)
  console.log("\n--- Gossip Girl Analysis ---");
  let gossipResult = null;
  try {
    const crossRef = analystResult
      ? [
          {
            id: analystResult.id,
            agentPersona: analystResult.agentPersona,
            summary: analystResult.summary,
            keyFacts: analystResult.keyFacts.map((f) => ({ text: f.text })),
            sentiment: extractSentimentLabel(analystResult),
            strategicThemes: analystResult.strategicThemes.map((t) => ({ label: t.label })),
          },
        ]
      : [];

    const start = Date.now();
    gossipResult = await analyzeSignalWithAgent(signalInput, GOSSIP_GIRL_CONFIG, crossRef);
    const elapsed = Date.now() - start;
    console.log(`  SUCCESS (${elapsed}ms)`);
    console.log(`  Confidence: ${gossipResult.confidence}`);
    console.log(`  Summary: ${gossipResult.summary.slice(0, 120)}...`);
    console.log(`  Facts: ${gossipResult.keyFacts.length}`);
    console.log(`  Themes: ${gossipResult.strategicThemes.length}`);
    console.log(`  Sentiment: ${JSON.stringify(gossipResult.sentiment)}`);
    console.log(`  Source match: ${gossipResult.sourceMatchPreference}`);
    console.log(`  Model: ${gossipResult.modelUsed}`);
    console.log(`  Cross-refs: ${gossipResult.crossReferences?.length || 0}`);
  } catch (err: any) {
    console.log(`  FAILED: ${err.message}`);
    if (err.issues) {
      console.log(`  Zod issues: ${JSON.stringify(err.issues, null, 2)}`);
    }
    if (err.stack) {
      console.log(`  Stack: ${err.stack.split("\n").slice(0, 5).join("\n")}`);
    }
  }

  // 5. Summary
  console.log("\n=== RESULTS ===");
  console.log(`  Analyst: ${analystResult ? "OK" : "FAILED"}`);
  console.log(`  Gossip Girl: ${gossipResult ? "OK" : "FAILED"}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
