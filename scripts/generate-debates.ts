/**
 * Generate debates for signals that have both Analyst and Gossip Girl analyses
 * but no debate record yet.
 * 
 * Usage: pnpm tsx scripts/generate-debates.ts
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { generateDebate } from '../src/lib/ai/agent/debate';
import type { AgentAnalysis } from '../src/lib/ai/agent/types';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Starting debate generation...\n");

  // Find all signals that have both Analyst and Gossip Girl analyses
  const signals = await prisma.signal.findMany({
    where: {
      status: 'ANALYZED',
      analyses: {
        some: { agentPersona: 'ANALYST' }
      }
    },
    include: {
      analyses: true,
      debates: true,
    },
  });

  console.log(`Found ${signals.length} analyzed signals\n`);

  // Filter to signals that have both analyses but no debate
  const signalsNeedingDebates = signals.filter((signal) => {
    const hasAnalyst = signal.analyses.some((a) => a.agentPersona === 'ANALYST');
    const hasGossip = signal.analyses.some((a) => a.agentPersona === 'GOSSIP_GIRL');
    const hasDebate = signal.debates.length > 0;
    return hasAnalyst && hasGossip && !hasDebate;
  });

  console.log(`Signals needing debates: ${signalsNeedingDebates.length}\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < signalsNeedingDebates.length; i++) {
    const signal = signalsNeedingDebates[i];
    const progress = `[${i + 1}/${signalsNeedingDebates.length}]`;
    
    console.log(`${progress} Processing signal: ${signal.title.substring(0, 60)}...`);

    try {
      const analystAnalysis = signal.analyses.find((a) => a.agentPersona === 'ANALYST');
      const gossipAnalysis = signal.analyses.find((a) => a.agentPersona === 'GOSSIP_GIRL');

      if (!analystAnalysis || !gossipAnalysis) {
        console.log(`  ⚠️  Missing analysis, skipping\n`);
        failCount++;
        continue;
      }

      // Convert DB records to AgentAnalysis format
      const analystForDebate: AgentAnalysis = {
        id: analystAnalysis.id,
        signalId: analystAnalysis.signalId,
        agentPersona: analystAnalysis.agentPersona as 'ANALYST',
        summary: analystAnalysis.summary,
        keyFacts: analystAnalysis.keyFacts as AgentAnalysis['keyFacts'],
        sentiment: (analystAnalysis.sentimentData || {
          sentiment: analystAnalysis.sentiment,
          confidence: 0.5,
          strength: undefined,
          key_phrases: [],
        }) as AgentAnalysis['sentiment'],
        strategicThemes: analystAnalysis.strategicThemes as AgentAnalysis['strategicThemes'],
        confidence: analystAnalysis.confidence,
        crossReferences: null,
        modelUsed: analystAnalysis.modelUsed,
        analyzedAt: analystAnalysis.analyzedAt,
      };

      const gossipForDebate: AgentAnalysis = {
        id: gossipAnalysis.id,
        signalId: gossipAnalysis.signalId,
        agentPersona: gossipAnalysis.agentPersona as 'GOSSIP_GIRL',
        summary: gossipAnalysis.summary,
        keyFacts: gossipAnalysis.keyFacts as AgentAnalysis['keyFacts'],
        sentiment: (gossipAnalysis.sentimentData || {
          surface_reading: 'neutral-surface',
          tell_strength: 0.5,
          key_phrases: [],
        }) as AgentAnalysis['sentiment'],
        strategicThemes: gossipAnalysis.strategicThemes as AgentAnalysis['strategicThemes'],
        confidence: gossipAnalysis.confidence,
        crossReferences: null,
        modelUsed: gossipAnalysis.modelUsed,
        analyzedAt: gossipAnalysis.analyzedAt,
      };

      console.log(`  Generating debate...`);
      const debate = await generateDebate(analystForDebate, gossipForDebate);

      await prisma.agentDebate.create({
        data: {
          signalId: signal.id,
          analystPosition: debate.analystPosition,
          gossipGirlPosition: debate.gossipGirlPosition,
          pointsOfAgreement: debate.pointsOfAgreement,
          pointsOfContention: debate.pointsOfContention,
          synthesis: debate.synthesis,
        },
      });

      console.log(`  ✓ Debate created\n`);
      successCount++;
    } catch (error) {
      console.log(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}\n`);
      failCount++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Debate generation complete!");
  console.log(`  ✓ Successful: ${successCount}`);
  console.log(`  ✗ Failed: ${failCount}`);
  console.log("=".repeat(60));
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  });
