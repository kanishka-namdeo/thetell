/**
 * Verify pipeline test results - check database for signals, analyses, and confidence scores
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== VERIFYING PIPELINE TEST RESULTS ===\n");

  // Count signals by source type
  const signals = await prisma.signal.findMany({
    select: {
      id: true,
      title: true,
      sourceType: true,
      status: true,
      createdAt: true,
    },
  });

  console.log(`Total signals in database: ${signals.length}`);
  const bySourceType = signals.reduce((acc, s) => {
    acc[s.sourceType] = (acc[s.sourceType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log("\nSignals by source type:");
  for (const [type, count] of Object.entries(bySourceType)) {
    console.log(`  ${type}: ${count}`);
  }

  // Count analyses by agent
  const analyses = await prisma.analysis.findMany({
    select: {
      id: true,
      signalId: true,
      agentPersona: true,
      confidence: true,
      sourceMatchPreference: true,
      sentiment: true,
      summary: true,
      signal: {
        select: {
          title: true,
          sourceType: true,
        },
      },
    },
  });

  console.log(`\nTotal analyses in database: ${analyses.length}`);
  const byAgent = analyses.reduce((acc, a) => {
    acc[a.agentPersona] = (acc[a.agentPersona] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log("\nAnalyses by agent:");
  for (const [agent, count] of Object.entries(byAgent)) {
    console.log(`  ${agent}: ${count}`);
  }

  // Show confidence scores with sourceMatchPreference
  console.log("\n=== CONFIDENCE SCORES WITH SOURCE MATCH PREFERENCE ===\n");
  
  // Group by signal
  const bySignal = analyses.reduce((acc, a) => {
    if (!acc[a.signalId]) {
      acc[a.signalId] = {
        title: a.signal.title,
        sourceType: a.signal.sourceType,
        analyses: [],
      };
    }
    acc[a.signalId].analyses.push({
      agent: a.agentPersona,
      confidence: a.confidence,
      sourceMatchPreference: a.sourceMatchPreference,
      sentiment: a.sentiment,
    });
    return acc;
  }, {} as Record<string, { title: string; sourceType: string; analyses: any[] }>);

  for (const [signalId, data] of Object.entries(bySignal)) {
    console.log(`Signal: "${data.title.slice(0, 60)}..."`);
    console.log(`Source Type: ${data.sourceType}`);
    for (const analysis of data.analyses) {
      console.log(`  ${analysis.agent}:`);
      console.log(`    Confidence: ${analysis.confidence.toFixed(3)}`);
      console.log(`    Source Match Preference: ${analysis.sourceMatchPreference}`);
      console.log(`    Sentiment: ${analysis.sentiment}`);
    }
    
    // Compare agents
    if (data.analyses.length === 2) {
      const analyst = data.analyses.find(a => a.agent === "ANALYST");
      const gossip = data.analyses.find(a => a.agent === "GOSSIP_GIRL");
      if (analyst && gossip) {
        const diff = analyst.confidence - gossip.confidence;
        const winner = diff > 0.001 ? "ANALYST" : diff < -0.001 ? "GOSSIP_GIRL" : "TIE";
        console.log(`  → Winner: ${winner} (diff: ${Math.abs(diff).toFixed(3)})`);
        
        // Check if preference boost worked
        if (data.sourceType === "NEWS" || data.sourceType === "FILING" || data.sourceType === "TRANSCRIPT") {
          if (analyst.sourceMatchPreference === true && analyst.confidence > gossip.confidence) {
            console.log(`  ✓ Analyst got preference boost for ${data.sourceType} signal`);
          }
        } else if (data.sourceType === "SOCIAL" || data.sourceType === "BLOG" || data.sourceType === "JOB_POSTING") {
          if (gossip.sourceMatchPreference === true && gossip.confidence > analyst.confidence) {
            console.log(`  ✓ Gossip Girl got preference boost for ${data.sourceType} signal`);
          }
        }
      }
    }
    console.log();
  }

  // Summary
  console.log("=== SUMMARY ===");
  console.log(`✓ Signals stored: ${signals.length}`);
  console.log(`✓ Analyses created: ${analyses.length}`);
  console.log(`✓ Analyst analyses: ${byAgent["ANALYST"] || 0}`);
  console.log(`✓ Gossip Girl analyses: ${byAgent["GOSSIP_GIRL"] || 0}`);
  
  const withPreference = analyses.filter(a => a.sourceMatchPreference === true).length;
  console.log(`✓ Analyses with source match preference: ${withPreference}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
