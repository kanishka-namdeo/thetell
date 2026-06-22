/**
 * Fix debates: delete old fallback debates and regenerate with improved prompt.
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
  console.log("Fixing debates...\n");

  // First, delete all existing debates (they're fallback/placeholder data)
  const deleteResult = await prisma.agentDebate.deleteMany({});
  console.log(`Deleted ${deleteResult.count} existing debate records\n`);

  // Find signals with both analyses
  const signals = await prisma.signal.findMany({
    where: { status: 'ANALYZED' },
    include: { analyses: true },
  });

  const signalsWithBoth = signals.filter((s) => {
    const hasAnalyst = s.analyses.some((a) => a.agentPersona === 'ANALYST');
    const hasGossip = s.analyses.some((a) => a.agentPersona === 'GOSSIP_GIRL');
    return hasAnalyst && hasGossip;
  });

  console.log(`Signals with both analyses: ${signalsWithBoth.length}\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < signalsWithBoth.length; i++) {
    const signal = signalsWithBoth[i];
    const progress = `[${i + 1}/${signalsWithBoth.length}]`;
    console.log(`${progress} ${signal.title.substring(0, 60)}...`);

    try {
      const analystAnalysis = signal.analyses.find((a) => a.agentPersona === 'ANALYST')!;
      const gossipAnalysis = signal.analyses.find((a) => a.agentPersona === 'GOSSIP_GIRL')!;

      const analystForDebate: AgentAnalysis = {
        id: analystAnalysis.id,
        signalId: analystAnalysis.signalId,
        agentPersona: analystAnalysis.agentPersona as 'ANALYST',
        summary: analystAnalysis.summary,
        keyFacts: analystAnalysis.keyFacts as AgentAnalysis['keyFacts'],
        sentiment: (analystAnalysis.sentimentData || {
          sentiment: analystAnalysis.sentiment,
          confidence: 0.5,
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
        }) as AgentAnalysis['sentiment'],
        strategicThemes: gossipAnalysis.strategicThemes as AgentAnalysis['strategicThemes'],
        confidence: gossipAnalysis.confidence,
        crossReferences: null,
        modelUsed: gossipAnalysis.modelUsed,
        analyzedAt: gossipAnalysis.analyzedAt,
      };

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

      console.log(`  ✓ Debate created`);
      successCount++;
    } catch (error) {
      console.log(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
      failCount++;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Debate fix complete!`);
  console.log(`  ✓ Successful: ${successCount}`);
  console.log(`  ✗ Failed: ${failCount}`);
  console.log(`${"=".repeat(60)}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
