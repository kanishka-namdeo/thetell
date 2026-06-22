import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { generateCrossSignalDebate } from '../src/lib/ai/agent/cross-signal-debate';
import type { WeightedAnalysis } from '../src/lib/ai/agent/cross-signal-debate';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Regenerating debates with post-processing...\n');
  
  const debates = await prisma.crossSignalDebate.findMany({
    include: {
      inference: {
        include: {
          company: true,
          theme: true,
        },
      },
    },
  });
  
  console.log(`Found ${debates.length} debates to regenerate\n`);
  
  for (const debate of debates) {
    console.log(`Processing: ${debate.inference.title}`);
    
    // Get the signals for this inference
    const supportingIds = debate.inference.supportingSignalIds as string[];
    
    // Get analyses for these signals
    const analyses = await prisma.analysis.findMany({
      where: {
        signalId: { in: supportingIds },
      },
      include: {
        signal: true,
      },
    });
    
    // Split by persona
    const analystAnalyses = analyses
      .filter((a) => a.agentPersona === 'ANALYST')
      .map((a) => ({
        id: a.id,
        signalId: a.signalId,
        agentPersona: 'ANALYST' as const,
        summary: a.summary,
        keyFacts: (a.keyFacts as any[]) || [],
        sentiment: a.sentimentData as any,
        strategicThemes: (a.strategicThemes as any[]) || [],
        confidence: a.confidence,
        crossReferences: null,
        modelUsed: a.modelUsed,
        analyzedAt: a.analyzedAt,
        sourceType: a.signal.sourceType as any,
        engagement: a.signal.engagement as any,
      }));
    
    const gossipAnalyses = analyses
      .filter((a) => a.agentPersona === 'GOSSIP_GIRL')
      .map((a) => ({
        id: a.id,
        signalId: a.signalId,
        agentPersona: 'GOSSIP_GIRL' as const,
        summary: a.summary,
        keyFacts: (a.keyFacts as any[]) || [],
        sentiment: a.sentimentData as any,
        strategicThemes: (a.strategicThemes as any[]) || [],
        confidence: a.confidence,
        crossReferences: null,
        modelUsed: a.modelUsed,
        analyzedAt: a.analyzedAt,
        sourceType: a.signal.sourceType as any,
        engagement: a.signal.engagement as any,
      }));
    
    if (analystAnalyses.length === 0 && gossipAnalyses.length === 0) {
      console.log('  No analyses found, skipping\n');
      continue;
    }
    
    try {
      // Generate new debate
      const newDebate = await generateCrossSignalDebate(
        analystAnalyses as WeightedAnalysis[],
        gossipAnalyses as WeightedAnalysis[],
        debate.inference.theme?.label || 'Unknown Theme',
        debate.inference.company.name,
      );
      
      // Update database
      await prisma.crossSignalDebate.update({
        where: { id: debate.id },
        data: {
          analystClaim: newDebate.analystPosition.claim || '',
          analystEvidence: newDebate.analystPosition.evidence || [],
          analystConfidence: newDebate.analystPosition.confidence,
          gossipClaim: newDebate.gossipGirlPosition.claim || '',
          gossipEvidence: newDebate.gossipGirlPosition.evidence || [],
          gossipTellStrength: newDebate.gossipGirlPosition.tellStrength,
          agreements: newDebate.pointsOfAgreement,
          contentions: newDebate.pointsOfContention,
          synthesisText: newDebate.synthesis,
          debateTranscript: JSON.stringify(newDebate),
        },
      });
      
      console.log(`  ✓ Updated`);
      console.log(`    Analyst claim: ${(newDebate.analystPosition.claim || '').substring(0, 60)}...`);
      console.log(`    Gossip claim: ${(newDebate.gossipGirlPosition.claim || '').substring(0, 60)}...\n`);
    } catch (error) {
      console.log(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
  
  await prisma.$disconnect();
}

main();
