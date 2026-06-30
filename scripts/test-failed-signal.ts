import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";
import { analyzeSignalWithAgent } from "../src/lib/ai/agent/pipeline";
import type { AgentAnalysisInput } from "../src/lib/ai/agent/pipeline";
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from "../src/lib/ai/agent/personas";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== TEST FAILED SIGNALS ===\n");

  // Get a few FAILED signals to test
  const failedSignals = await prisma.signal.findMany({
    where: { status: "FAILED" },
    include: { company: true },
    take: 3,
  });

  console.log(`Found ${failedSignals.length} FAILED signals to test\n`);

  for (const signal of failedSignals) {
    console.log(`\n--- Testing: ${signal.title.slice(0, 60)} ---`);
    console.log(`  ID: ${signal.id}`);
    console.log(`  Content length: ${signal.rawContent.length}`);
    console.log(`  Content preview: ${signal.rawContent.slice(0, 150)}...`);

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

    // Test Analyst
    try {
      console.log("\n  Testing Analyst...");
      const start = Date.now();
      const result = await analyzeSignalWithAgent(signalInput, ANALYST_CONFIG);
      console.log(`  ✓ Analyst SUCCESS (${Date.now() - start}ms)`);
      console.log(`    Confidence: ${result.confidence}`);
      console.log(`    Facts: ${result.keyFacts.length}`);
    } catch (err: any) {
      console.log(`  ✗ Analyst FAILED: ${err.message}`);
      if (err.stack) {
        console.log(`    Stack: ${err.stack.split("\n").slice(0, 3).join("\n")}`);
      }
    }

    // Test Gossip Girl
    try {
      console.log("\n  Testing Gossip Girl...");
      const start = Date.now();
      const result = await analyzeSignalWithAgent(signalInput, GOSSIP_GIRL_CONFIG);
      console.log(`  ✓ Gossip Girl SUCCESS (${Date.now() - start}ms)`);
      console.log(`    Confidence: ${result.confidence}`);
      console.log(`    Facts: ${result.keyFacts.length}`);
    } catch (err: any) {
      console.log(`  ✗ Gossip Girl FAILED: ${err.message}`);
      if (err.stack) {
        console.log(`    Stack: ${err.stack.split("\n").slice(0, 3).join("\n")}`);
      }
    }
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);
