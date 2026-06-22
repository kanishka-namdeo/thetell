/**
 * Re-run analysis for all existing signals to generate Gossip Girl analyses and debates.
 * 
 * This script:
 * 1. Finds all signals that only have ANALYST analyses
 * 2. Runs Gossip Girl analysis for each
 * 3. Generates debates for signals with both analyses
 * 
 * Usage: pnpm tsx scripts/reanalyze-all-signals.ts
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { analyzeSignalWithAgent } from '../src/lib/ai/agent/pipeline';
import { generateDebate } from '../src/lib/ai/agent/debate';
import { GOSSIP_GIRL_CONFIG } from '../src/lib/ai/agent/personas';
import { extractSentimentLabel } from '../src/lib/ai/agent/types';
import type { CrossRefAnalysis, AgentAnalysisInput } from '../src/lib/ai/agent/pipeline';
import type { AgentAnalysis } from '../src/lib/ai/agent/types';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Starting reanalysis of all signals...\n");

  // Find all signals that have been analyzed
  const signals = await prisma.signal.findMany({
    where: {
      status: "ANALYZED",
    },
    include: {
      company: true,
      analyses: true,
    },
  });

  console.log(`Found ${signals.length} analyzed signals\n`);

  // Filter to signals that only have ANALYST analyses (missing GOSSIP_GIRL)
  const signalsNeedingGossip = signals.filter((signal) => {
    const hasAnalyst = signal.analyses.some((a) => a.agentPersona === "ANALYST");
    const hasGossip = signal.analyses.some((a) => a.agentPersona === "GOSSIP_GIRL");
    return hasAnalyst && !hasGossip;
  });

  console.log(`Signals needing Gossip Girl analysis: ${signalsNeedingGossip.length}\n`);

  let successCount = 0;
  let failCount = 0;
  let debateCount = 0;

  for (let i = 0; i < signalsNeedingGossip.length; i++) {
    const signal = signalsNeedingGossip[i];
    const progress = `[${i + 1}/${signalsNeedingGossip.length}]`;
    
    console.log(`${progress} Processing signal: ${signal.title.substring(0, 60)}...`);

    try {
      // Get existing Analyst analysis for cross-reference
      const analystAnalysis = signal.analyses.find((a) => a.agentPersona === "ANALYST");
      
      if (!analystAnalysis) {
        console.log(`  ⚠️  No Analyst analysis found, skipping\n`);
        failCount++;
        continue;
      }

      // Prepare signal input for pipeline
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

      // Build cross-reference from Analyst analysis
      const crossRefAnalyses: CrossRefAnalysis[] = [
        {
          id: analystAnalysis.id,
          agentPersona: analystAnalysis.agentPersona as "ANALYST" | "GOSSIP_GIRL",
          summary: analystAnalysis.summary,
          keyFacts: (analystAnalysis.keyFacts as Array<{ text: string }>).map((f) => ({
            text: f.text,
          })),
          sentiment: analystAnalysis.sentiment,
          strategicThemes: (
            analystAnalysis.strategicThemes as Array<{ label: string }>
          ).map((t) => ({ label: t.label })),
        },
      ];

      // Run Gossip Girl analysis
      console.log(`  Running Gossip Girl analysis...`);
      const gossipAnalysis = await analyzeSignalWithAgent(
        signalInput,
        GOSSIP_GIRL_CONFIG,
        crossRefAnalyses
      );

      // Extract sentiment label
      const gossipSentimentLabel = extractSentimentLabel(gossipAnalysis);

      // Create Gossip Girl analysis record
      await prisma.analysis.create({
        data: {
          id: gossipAnalysis.id,
          signalId: signal.id,
          agentPersona: "GOSSIP_GIRL",
          summary: gossipAnalysis.summary,
          keyFacts: gossipAnalysis.keyFacts,
          sentiment: gossipSentimentLabel,
          sentimentData: gossipAnalysis.sentiment,
          strategicThemes: gossipAnalysis.strategicThemes,
          confidence: gossipAnalysis.confidence,
          modelUsed: gossipAnalysis.modelUsed,
          crossReferences: gossipAnalysis.crossReferences ?? undefined,
          analyzedAt: new Date(gossipAnalysis.analyzedAt),
        },
      });

      console.log(`  ✓ Gossip Girl analysis created (confidence: ${(gossipAnalysis.confidence * 100).toFixed(1)}%)`);
      successCount++;

      // Generate debate if we have both analyses
      if (analystAnalysis && gossipAnalysis) {
        try {
          console.log(`  Generating debate...`);
          
          // Convert DB records to AgentAnalysis format for debate generation
          const analystForDebate: AgentAnalysis = {
            id: analystAnalysis.id,
            signalId: analystAnalysis.signalId,
            agentPersona: analystAnalysis.agentPersona as "ANALYST",
            summary: analystAnalysis.summary,
            keyFacts: analystAnalysis.keyFacts as AgentAnalysis["keyFacts"],
            sentiment: (analystAnalysis.sentimentData || {
              sentiment: analystAnalysis.sentiment,
              confidence: 0.5,
              strength: undefined,
              key_phrases: [],
            }) as AgentAnalysis["sentiment"],
            strategicThemes: analystAnalysis.strategicThemes as AgentAnalysis["strategicThemes"],
            confidence: analystAnalysis.confidence,
            crossReferences: null,
            modelUsed: analystAnalysis.modelUsed,
            analyzedAt: analystAnalysis.analyzedAt,
          };

          const gossipForDebate: AgentAnalysis = {
            id: gossipAnalysis.id,
            signalId: gossipAnalysis.signalId,
            agentPersona: gossipAnalysis.agentPersona as "GOSSIP_GIRL",
            summary: gossipAnalysis.summary,
            keyFacts: gossipAnalysis.keyFacts,
            sentiment: gossipAnalysis.sentiment,
            strategicThemes: gossipAnalysis.strategicThemes,
            confidence: gossipAnalysis.confidence,
            crossReferences: gossipAnalysis.crossReferences,
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
          debateCount++;
        } catch (debateError) {
          console.log(`  ⚠️  Debate generation failed: ${debateError instanceof Error ? debateError.message : String(debateError)}`);
        }
      }

      console.log();
    } catch (error) {
      console.log(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}\n`);
      failCount++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Reanalysis complete!");
  console.log(`  ✓ Successful: ${successCount}`);
  console.log(`  ✗ Failed: ${failCount}`);
  console.log(`  💬 Debates generated: ${debateCount}`);
  console.log("=".repeat(60));
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  });
