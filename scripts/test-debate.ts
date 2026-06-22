/**
 * Quick test: generate a single debate to verify the improved prompt works.
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
  // Find a signal with BOTH analyst and gossip girl analyses
  const signals = await prisma.signal.findMany({
    where: {
      status: 'ANALYZED',
    },
    include: { analyses: true, debates: true },
  });

  const signal = signals.find((s) => {
    const hasAnalyst = s.analyses.some((a) => a.agentPersona === 'ANALYST');
    const hasGossip = s.analyses.some((a) => a.agentPersona === 'GOSSIP_GIRL');
    return hasAnalyst && hasGossip;
  });

  if (!signal) {
    console.log('No signals found');
    return;
  }

  // Skip if debate already exists
  if (signal.debates.length > 0) {
    console.log('Signal already has debate, skipping');
    return;
  }

  const analystAnalysis = signal.analyses.find((a) => a.agentPersona === 'ANALYST');
  const gossipAnalysis = signal.analyses.find((a) => a.agentPersona === 'GOSSIP_GIRL');

  if (!analystAnalysis || !gossipAnalysis) {
    console.log(`Signal ${signal.id} missing analyses`);
    return;
  }

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

  console.log(`Testing debate for: ${signal.title}`);
  try {
    const debate = await generateDebate(analystForDebate, gossipForDebate);
    console.log('\n✓ Debate generated successfully!');
    console.log('  Analyst claim:', (debate.analystPosition.claim || '').substring(0, 80));
    console.log('  GG claim:', (debate.gossipGirlPosition.claim || '').substring(0, 80));
    console.log('  Agreements:', debate.pointsOfAgreement.length);
    console.log('  Contentions:', debate.pointsOfContention.length);
    console.log('  Synthesis:', debate.synthesis.substring(0, 80));
  } catch (error) {
    console.error('\n✗ Debate generation failed:', error instanceof Error ? error.message : String(error));
  }
}

main();
