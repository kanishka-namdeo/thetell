/**
 * Standalone correlation runner — triggers the cross-signal correlation
 * logic without requiring Inngest. Useful for testing and manual runs.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { generateEmbedding, cosineSimilarity } from '../src/lib/nlp/embedding-generator.js';
import { getProvider } from '../src/lib/ai/provider.js';
import { generateCrossSignalDebate } from '../src/lib/ai/agent/cross-signal-debate.js';
import { calculateSignalWeight } from '../src/lib/ai/confidence.js';
import { z } from 'zod';

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const INFERENCE_TITLE_SCHEMA = z.object({
  title: z.string(),
  summary: z.string(),
});

interface ThemeCluster {
  label: string;
  signalIds: string[];
  sourceTypes: string[];
  companyIds: string[];
}

async function clusterThemes(analyses: Array<{
  signalId: string;
  strategicThemes: Array<{ label: string }>;
  sourceType: string;
  companyId: string;
}>): Promise<ThemeCluster[]> {
  const allThemes: Array<{
    label: string;
    signalId: string;
    sourceType: string;
    companyId: string;
    embedding?: number[];
  }> = [];

  for (const analysis of analyses) {
    const themes = Array.isArray(analysis.strategicThemes) ? analysis.strategicThemes : [];
    for (const theme of themes) {
      if (theme.label && typeof theme.label === 'string') {
        allThemes.push({
          label: theme.label,
          signalId: analysis.signalId,
          sourceType: analysis.sourceType,
          companyId: analysis.companyId,
        });
      }
    }
  }

  if (allThemes.length === 0) return [];

  const uniqueLabels = [...new Set(allThemes.map(t => t.label))];
  const labelEmbeddings = new Map<string, number[]>();

  for (const label of uniqueLabels) {
    try {
      const embedding = await generateEmbedding(label);
      labelEmbeddings.set(label, embedding);
    } catch {
      // Skip
    }
  }

  for (const theme of allThemes) {
    theme.embedding = labelEmbeddings.get(theme.label);
  }

  const clusters: ThemeCluster[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < allThemes.length; i++) {
    if (assigned.has(i) || !allThemes[i].embedding) continue;

    const cluster: ThemeCluster = {
      label: allThemes[i].label,
      signalIds: [allThemes[i].signalId],
      sourceTypes: [allThemes[i].sourceType],
      companyIds: [allThemes[i].companyId],
    };
    assigned.add(i);

    for (let j = i + 1; j < allThemes.length; j++) {
      if (assigned.has(j) || !allThemes[j].embedding) continue;
      const sim = cosineSimilarity(allThemes[i].embedding!, allThemes[j].embedding!);
      if (sim > 0.75) {
        cluster.signalIds.push(allThemes[j].signalId);
        cluster.sourceTypes.push(allThemes[j].sourceType);
        if (!cluster.companyIds.includes(allThemes[j].companyId)) {
          cluster.companyIds.push(allThemes[j].companyId);
        }
        assigned.add(j);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

async function main() {
  console.log('=== Running Cross-Signal Correlation ===\n');

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Step 1: Load recent analyses
  console.log('Step 1: Loading recent analyses...');
  const recentAnalyses = await prisma.analysis.findMany({
    where: {
      analyzedAt: { gte: sevenDaysAgo },
      confidence: { gte: 0.5 },
    },
    include: {
      signal: {
        select: {
          id: true,
          sourceType: true,
          companyId: true,
          scrapedAt: true,
        },
      },
    },
    orderBy: { analyzedAt: 'desc' },
  });

  console.log(`  Found ${recentAnalyses.length} recent analyses`);

  if (recentAnalyses.length === 0) {
    console.log('  No recent analyses found. Expanding to ALL analyses...');
    const allAnalyses = await prisma.analysis.findMany({
      where: { confidence: { gte: 0.5 } },
      include: {
        signal: {
          select: {
            id: true,
            sourceType: true,
            companyId: true,
            scrapedAt: true,
          },
        },
      },
      orderBy: { analyzedAt: 'desc' },
    });
    console.log(`  Found ${allAnalyses.length} total analyses`);
    recentAnalyses.push(...allAnalyses);
  }

  if (recentAnalyses.length === 0) {
    console.log('No analyses found at all. Exiting.');
    await prisma.$disconnect();
    return;
  }

  // Step 2: Cluster themes
  console.log('\nStep 2: Clustering themes...');
  const analysisData = recentAnalyses.map(a => ({
    signalId: a.signalId,
    strategicThemes: Array.isArray(a.strategicThemes) ? (a.strategicThemes as Array<{ label: string }>) : [],
    sourceType: a.signal.sourceType,
    companyId: a.signal.companyId,
  }));

  const clusters = await clusterThemes(analysisData);
  console.log(`  Found ${clusters.length} theme clusters`);

  for (const cluster of clusters) {
    console.log(`  - "${cluster.label}" (${cluster.signalIds.length} signals, ${new Set(cluster.sourceTypes).size} source types)`);
  }

  // Step 3: Create themes and inferences
  console.log('\nStep 3: Creating themes and inferences...');
  let themesCreated = 0;
  let inferencesCreated = 0;
  let debatesCreated = 0;

  const companyClusterMap = new Map<string, ThemeCluster[]>();
  for (const cluster of clusters) {
    for (const companyId of new Set(cluster.companyIds)) {
      if (!companyClusterMap.has(companyId)) {
        companyClusterMap.set(companyId, []);
      }
      companyClusterMap.get(companyId)!.push(cluster);
    }
  }

  for (const [companyId, companyClusters] of companyClusterMap) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) continue;

    console.log(`\n  Company: ${company.name}`);

    for (const cluster of companyClusters) {
      const uniqueSourceTypes = new Set(cluster.sourceTypes);

      // Find or create theme
      let theme = await prisma.signalTheme.findFirst({
        where: {
          companyId,
          label: { contains: cluster.label, mode: 'insensitive' },
        },
      });

      if (!theme) {
        theme = await prisma.signalTheme.create({
          data: {
            companyId,
            label: cluster.label,
            status: 'EMERGING',
            momentum: 0.5,
            firstSeen: now,
            lastUpdated: now,
          },
        });
        themesCreated++;
        console.log(`    Created theme: "${cluster.label}"`);
      }

      // Link signals to theme
      for (const signalId of cluster.signalIds) {
        try {
          await prisma.signal.update({
            where: { id: signalId },
            data: { themes: { connect: { id: theme.id } } },
          });
        } catch { /* already connected */ }
      }

      // Check if we should create an inference (3+ signals, 2+ source types)
      if (cluster.signalIds.length < 3 || uniqueSourceTypes.size < 2) {
        console.log(`    Skipping inference (need 3+ signals from 2+ types, got ${cluster.signalIds.length} signals from ${uniqueSourceTypes.size} types)`);
        continue;
      }

      // Check for existing inference
      const existingInference = await prisma.inference.findFirst({
        where: { themeId: theme.id },
      });
      if (existingInference) {
        console.log(`    Inference already exists for "${cluster.label}"`);
        continue;
      }

      // Generate inference title
      console.log(`    Generating inference for "${cluster.label}"...`);
      const provider = getProvider('openai');
      let title = `Cross-signal pattern: ${cluster.label}`;
      let summary = `Multiple signals converge on "${cluster.label}" for ${company.name}.`;

      try {
        const result = await provider.completeStructured(
          [
            { role: 'system', content: 'You are a corporate intelligence analyst. Generate a concise inference title and summary.' },
            { role: 'user', content: `Company: ${company.name}\nTheme: ${cluster.label}\nSource types: ${[...uniqueSourceTypes].join(', ')}\nSignals: ${cluster.signalIds.length}\n\nGenerate a title (one line) and summary (2-3 sentences).` },
          ],
          INFERENCE_TITLE_SCHEMA,
          { temperature: 0.3 },
        );
        title = result.title;
        summary = result.summary;
      } catch (err) {
        console.log(`    Title generation failed: ${err}`);
      }

      // Load analyses for confidence
      const analyses = await prisma.analysis.findMany({
        where: { signalId: { in: cluster.signalIds } },
        select: { confidence: true, agentPersona: true, summary: true },
      });

      const avgConfidence = analyses.length > 0
        ? analyses.reduce((s, a) => s + a.confidence, 0) / analyses.length
        : 0.5;
      const convergenceBonus = Math.min((uniqueSourceTypes.size - 1) * 0.05, 0.15);
      const finalConfidence = Math.min(avgConfidence + convergenceBonus, 1.0);

      const analystAnalyses = analyses.filter(a => a.agentPersona === 'ANALYST');
      const gossipAnalyses = analyses.filter(a => a.agentPersona === 'GOSSIP_GIRL');

      const inference = await prisma.inference.create({
        data: {
          companyId,
          themeId: theme.id,
          title,
          hypothesis: summary,
          confidence: finalConfidence,
          supportingSignalIds: cluster.signalIds,
          sourceTypesInvolved: [...uniqueSourceTypes],
          status: 'EMERGING',
          agentAnalyses: {
            analyst: {
              analysisCount: analystAnalyses.length,
              avgConfidence: analystAnalyses.length > 0
                ? analystAnalyses.reduce((s, a) => s + a.confidence, 0) / analystAnalyses.length
                : 0,
              summaries: analystAnalyses.map(a => a.summary),
            },
            gossipGirl: {
              analysisCount: gossipAnalyses.length,
              avgConfidence: gossipAnalyses.length > 0
                ? gossipAnalyses.reduce((s, a) => s + a.confidence, 0) / gossipAnalyses.length
                : 0,
              summaries: gossipAnalyses.map(a => a.summary),
            },
          },
        },
      });

      inferencesCreated++;
      console.log(`    Created inference: "${title}" (confidence: ${finalConfidence.toFixed(2)})`);

      // Step 5: Generate cross-signal debate
      console.log(`    Generating cross-signal debate...`);
      try {
        const signals = await prisma.signal.findMany({
          where: { id: { in: cluster.signalIds } },
          select: { id: true, sourceType: true, engagement: true },
        });
        const signalMetadata = new Map(
          signals.map(s => [s.id, { sourceType: s.sourceType, engagement: s.engagement }])
        );

        const analystDbAnalyses = await prisma.analysis.findMany({
          where: { signalId: { in: cluster.signalIds }, agentPersona: 'ANALYST' },
        });
        const gossipDbAnalyses = await prisma.analysis.findMany({
          where: { signalId: { in: cluster.signalIds }, agentPersona: 'GOSSIP_GIRL' },
        });

        const analystMapped = analystDbAnalyses.map(a => {
          const meta = signalMetadata.get(a.signalId);
          return {
            id: a.id,
            signalId: a.signalId,
            agentPersona: 'ANALYST' as const,
            summary: a.summary,
            keyFacts: (Array.isArray(a.keyFacts) ? a.keyFacts : []) as any[],
            sentiment: (a.sentimentData as any) ?? { sentiment: a.sentiment, strength: undefined, confidence: a.confidence, key_phrases: [] },
            strategicThemes: (Array.isArray(a.strategicThemes) ? a.strategicThemes : []) as any[],
            confidence: a.confidence,
            crossReferences: null,
            modelUsed: a.modelUsed,
            analyzedAt: a.analyzedAt,
            sourceType: meta?.sourceType,
            engagement: meta?.engagement,
          };
        });

        const gossipMapped = gossipDbAnalyses.map(a => {
          const meta = signalMetadata.get(a.signalId);
          return {
            id: a.id,
            signalId: a.signalId,
            agentPersona: 'GOSSIP_GIRL' as const,
            summary: a.summary,
            keyFacts: (Array.isArray(a.keyFacts) ? a.keyFacts : []) as any[],
            sentiment: (a.sentimentData as any) ?? { surface_reading: 'neutral-surface', tell_strength: a.confidence, key_phrases: [] },
            strategicThemes: (Array.isArray(a.strategicThemes) ? a.strategicThemes : []) as any[],
            confidence: a.confidence,
            crossReferences: null,
            modelUsed: a.modelUsed,
            analyzedAt: a.analyzedAt,
            sourceType: meta?.sourceType,
            engagement: meta?.engagement,
          };
        });

        if (analystMapped.length === 0 && gossipMapped.length === 0) {
          console.log(`    No analyses for debate, skipping`);
          continue;
        }

        const debate = await generateCrossSignalDebate(
          analystMapped,
          gossipMapped,
          cluster.label,
          company.name,
        );

        const transcript = JSON.stringify(debate);
        const consensusReached = debate.pointsOfAgreement.length > 0 && debate.pointsOfContention.length === 0;
        const debateFinalConfidence = (debate.analystPosition.confidence + debate.gossipGirlPosition.tellStrength) / 2;

        const debateRecord = await prisma.crossSignalDebate.create({
          data: {
            inferenceId: inference.id,
            debateTranscript: transcript,
            consensusReached,
            finalConfidence: debateFinalConfidence,
            status: 'ACTIVE',
            analystClaim: debate.analystPosition.claim ?? '',
            analystEvidence: debate.analystPosition.evidence ?? [],
            analystConfidence: debate.analystPosition.confidence ?? 0.5,
            gossipClaim: debate.gossipGirlPosition.claim ?? '',
            gossipEvidence: debate.gossipGirlPosition.evidence ?? [],
            gossipTellStrength: debate.gossipGirlPosition.tellStrength ?? 0.5,
            agreements: debate.pointsOfAgreement ?? [],
            contentions: debate.pointsOfContention ?? [],
            synthesisText: debate.synthesis ?? '',
          },
        });

        await prisma.inference.update({
          where: { id: inference.id },
          data: { debateId: debateRecord.id },
        });

        debatesCreated++;
        console.log(`    Created debate! Consensus: ${consensusReached}, Confidence: ${debateFinalConfidence.toFixed(2)}`);
        console.log(`    Analyst claim: ${debate.analystPosition.claim?.substring(0, 100)}...`);
        console.log(`    Gossip claim: ${debate.gossipGirlPosition.claim?.substring(0, 100)}...`);
        console.log(`    Agreements: ${debate.pointsOfAgreement.length}`);
        console.log(`    Contentions: ${debate.pointsOfContention.length}`);
      } catch (err) {
        console.log(`    Debate generation failed: ${err}`);
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Themes created: ${themesCreated}`);
  console.log(`Inferences created: ${inferencesCreated}`);
  console.log(`Debates created: ${debatesCreated}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
