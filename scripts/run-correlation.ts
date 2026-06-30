/**
 * Manually trigger the correlation (clustering) pipeline.
 *
 * Usage: pnpm tsx scripts/run-correlation.ts
 */

import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });
  
  console.log("\n=== Triggering correlation pipeline ===\n");

  const { prisma } = await import("../src/lib/db");
  const { clusterThemes, calculateMomentum, computeClusterCentroid, generateInferenceTitle } = await import("../src/lib/inngest/correlation");
  const { generateCrossSignalDebate } = await import("../src/lib/ai/agent/cross-signal-debate");
  const { generateClusterArticle } = await import("../src/lib/ai/agent/cluster-article-generator");
  const { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } = await import("../src/lib/ai/agent/personas");
  const { logger } = await import("../src/lib/logger");

  const log = logger.child({ function: "correlate-signals-manual" });
  const now = new Date();

  try {
    // Step 1: Get recent analyses (last 7 days)
    console.log("Step 1: Loading recent analyses...");
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

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
      orderBy: { analyzedAt: "desc" },
    });

    console.log(`  Loaded ${recentAnalyses.length} recent analyses`);

    if (recentAnalyses.length === 0) {
      console.log("\n⚠ No recent analyses to cluster. Exiting.");
      await prisma.$disconnect();
      return;
    }

    // Step 2: Cluster themes across all analyses
    console.log("\nStep 2: Clustering themes...");
    const analysisData = recentAnalyses.map((a) => ({
      signalId: a.signalId,
      strategicThemes: Array.isArray(a.strategicThemes)
        ? (a.strategicThemes as Array<{ label: string }>)
        : [],
      sourceType: a.signal.sourceType,
      companyId: a.signal.companyId,
    }));

    const clusters = await clusterThemes(analysisData);
    console.log(`  Created ${clusters.length} theme clusters`);

    // Step 3: For each company, create/update SignalTheme records
    console.log("\nStep 3: Creating/updating SignalTheme records...");
    let themesUpdated = 0;
    const companyThemes: Array<{
      themeId: string;
      companyId: string;
      label: string;
      signalIds: string[];
      sourceTypes: string[];
    }> = [];

    // Group clusters by company
    const companyClusterMap = new Map<string, typeof clusters>();

    for (const cluster of clusters) {
      for (const companyId of new Set(cluster.companyIds)) {
        if (!companyClusterMap.has(companyId)) {
          companyClusterMap.set(companyId, []);
        }
        companyClusterMap.get(companyId)!.push(cluster);
      }
    }

    for (const [companyId, companyClusters] of companyClusterMap) {
      for (const cluster of companyClusters) {
        // Find or create SignalTheme
        const existingTheme = await prisma.signalTheme.findFirst({
          where: {
            companyId,
            label: { contains: cluster.label, mode: "insensitive" },
          },
        });

        // Calculate momentum for this theme
        const signals = await prisma.signal.findMany({
          where: { id: { in: cluster.signalIds } },
          select: { id: true, scrapedAt: true, sourceType: true, engagement: true },
        });

        // Load per-signal confidence
        const signalAnalyses = await prisma.analysis.findMany({
          where: { signalId: { in: cluster.signalIds } },
          select: { signalId: true, confidence: true },
        });
        const confidenceBySignal = new Map<string, number>();
        for (const a of signalAnalyses) {
          const existing = confidenceBySignal.get(a.signalId) ?? 0;
          confidenceBySignal.set(a.signalId, Math.max(existing, a.confidence));
        }

        // Check agent agreement
        const themeAnalyses = await prisma.analysis.findMany({
          where: { signalId: { in: cluster.signalIds } },
          select: { agentPersona: true, strategicThemes: true },
        });
        const analystHasTheme = themeAnalyses.some(
          (a) =>
            a.agentPersona === "ANALYST" &&
            Array.isArray(a.strategicThemes) &&
            (a.strategicThemes as Array<{ label: string }>).some(
              (t) => t.label.toLowerCase() === cluster.label.toLowerCase(),
            ),
        );
        const gossipHasTheme = themeAnalyses.some(
          (a) =>
            a.agentPersona === "GOSSIP_GIRL" &&
            Array.isArray(a.strategicThemes) &&
            (a.strategicThemes as Array<{ label: string }>).some(
              (t) => t.label.toLowerCase() === cluster.label.toLowerCase(),
            ),
        );
        const agentAgreement = analystHasTheme && gossipHasTheme;

        const enrichedSignals = signals.map((s) => ({
          scrapedAt: s.scrapedAt,
          sourceType: s.sourceType,
          id: s.id,
          confidence: confidenceBySignal.get(s.id),
          engagement: s.engagement as Record<string, unknown> | null,
        }));
        const { momentum, status } = calculateMomentum(
          enrichedSignals,
          now,
          agentAgreement,
        );

        // Compute cluster embedding centroid
        const clusterCentroid = await computeClusterCentroid(cluster.signalIds);

        let themeId: string;

        if (existingTheme) {
          await prisma.signalTheme.update({
            where: { id: existingTheme.id },
            data: {
              momentum,
              status,
              lastUpdated: now,
              ...(clusterCentroid && { embedding: clusterCentroid }),
            },
          });
          themeId = existingTheme.id;
        } else {
          const created = await prisma.signalTheme.create({
            data: {
              companyId,
              label: cluster.label,
              status,
              momentum,
              firstSeen: now,
              lastUpdated: now,
              ...(clusterCentroid && { embedding: clusterCentroid }),
            },
          });
          themeId = created.id;
        }

        // Link signals to theme
        for (const signalId of cluster.signalIds) {
          try {
            await prisma.signal.update({
              where: { id: signalId },
              data: {
                themes: {
                  connect: { id: themeId },
                },
              },
            });
          } catch {
            // Signal may already be connected
          }
        }

        companyThemes.push({
          themeId,
          companyId,
          label: cluster.label,
          signalIds: cluster.signalIds,
          sourceTypes: cluster.sourceTypes,
        });
        themesUpdated++;
      }
    }

    console.log(`  Updated ${themesUpdated} themes`);

    // Step 4: Generate inferences for high-convergence themes
    console.log("\nStep 4: Generating inferences...");
    let inferencesCreated = 0;
    const newInferenceIds: Array<{
      inferenceId: string;
      themeLabel: string;
      companyName: string;
      signalIds: string[];
    }> = [];

    const inferenceThreshold = 3;
    const minSourceTypes = 2;

    for (const theme of companyThemes) {
      const uniqueSourceTypes = new Set(theme.sourceTypes);

      // Only generate inference if at least 3 signals from 2+ source types
      if (
        theme.signalIds.length < inferenceThreshold ||
        uniqueSourceTypes.size < minSourceTypes
      ) {
        continue;
      }

      // Check for existing inference for this theme in last 7 days
      const existingInference = await prisma.inference.findFirst({
        where: {
          themeId: theme.themeId,
          createdAt: { gte: sevenDaysAgo },
        },
      });

      if (existingInference) continue;

      // Get company name
      const company = await prisma.company.findUnique({
        where: { id: theme.companyId },
        select: { name: true },
      });
      if (!company) continue;

      // Generate inference title and summary
      const { title, summary } = await generateInferenceTitle(
        {
          label: theme.label,
          signalIds: theme.signalIds,
          sourceTypes: theme.sourceTypes,
          companyIds: [theme.companyId],
          avgEmbedding: [],
        },
        company.name,
        theme.sourceTypes,
      );

      // Load all analyses for the theme's signals
      const analyses = await prisma.analysis.findMany({
        where: { signalId: { in: theme.signalIds } },
        select: {
          id: true,
          signalId: true,
          agentPersona: true,
          summary: true,
          confidence: true,
          sentiment: true,
          strategicThemes: true,
        },
      });

      // Base confidence from supporting analyses
      const avgConfidence =
        analyses.length > 0
          ? analyses.reduce((sum, a) => sum + a.confidence, 0) /
            analyses.length
          : 0.5;

      // Cross-signal convergence bonus
      const sourceTypeCount = uniqueSourceTypes.size;
      const convergenceBonus = Math.min(
        (sourceTypeCount - 1) * 0.05,
        0.15,
      );
      const finalConfidence = Math.min(avgConfidence + convergenceBonus, 1.0);

      // Build per-agent summaries
      const analystAnalyses = analyses.filter(
        (a) => a.agentPersona === "ANALYST",
      );
      const gossipAnalyses = analyses.filter(
        (a) => a.agentPersona === "GOSSIP_GIRL",
      );

      const agentAnalysesData = {
        analyst: {
          analysisCount: analystAnalyses.length,
          avgConfidence:
            analystAnalyses.length > 0
              ? analystAnalyses.reduce((s, a) => s + a.confidence, 0) /
                analystAnalyses.length
              : 0,
          summaries: analystAnalyses.map((a) => a.summary),
        },
        gossipGirl: {
          analysisCount: gossipAnalyses.length,
          avgConfidence:
            gossipAnalyses.length > 0
              ? gossipAnalyses.reduce((s, a) => s + a.confidence, 0) /
                gossipAnalyses.length
              : 0,
          summaries: gossipAnalyses.map((a) => a.summary),
        },
      };

      const inference = await prisma.inference.create({
        data: {
          companyId: theme.companyId,
          themeId: theme.themeId,
          title,
          hypothesis: summary,
          confidence: finalConfidence,
          supportingSignalIds: theme.signalIds,
          sourceTypesInvolved: [...uniqueSourceTypes],
          status: "EMERGING",
          agentAnalyses: agentAnalysesData,
        },
      });

      inferencesCreated++;
      newInferenceIds.push({
        inferenceId: inference.id,
        themeLabel: theme.label,
        companyName: company.name,
        signalIds: theme.signalIds,
      });

      console.log(`  Created inference: ${title}`);
    }

    console.log(`  Created ${inferencesCreated} inferences`);

    // Step 5: Generate cross-signal debates for new inferences
    console.log("\nStep 5: Generating cross-signal debates...");
    let debatesCreated = 0;

    for (const item of newInferenceIds) {
      try {
        // Load signal metadata
        const signals = await prisma.signal.findMany({
          where: { id: { in: item.signalIds } },
          select: { id: true, sourceType: true, engagement: true, title: true },
        });
        const signalMetadata = new Map(
          signals.map((s) => [
            s.id,
            {
              sourceType: s.sourceType,
              engagement: s.engagement as Record<string, unknown> | null,
              title: s.title,
            },
          ]),
        );

        // Load analyses for both agents
        const analystDbAnalyses = await prisma.analysis.findMany({
          where: {
            signalId: { in: item.signalIds },
            agentPersona: "ANALYST",
          },
        });

        const gossipDbAnalyses = await prisma.analysis.findMany({
          where: {
            signalId: { in: item.signalIds },
            agentPersona: "GOSSIP_GIRL",
          },
        });

        // Convert to AgentAnalysis shape
        const analystAnalyses = analystDbAnalyses.map((a) => {
          const meta = signalMetadata.get(a.signalId);
          return {
            id: a.id,
            signalId: a.signalId,
            agentPersona: "ANALYST" as const,
            summary: a.summary,
            keyFacts: ((Array.isArray(a.keyFacts) ? a.keyFacts : []) as any) ?? [],
            sentiment: (a.sentimentData as any) ?? {
              sentiment: a.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL",
              strength: undefined,
              confidence: a.confidence,
              key_phrases: [],
            },
            strategicThemes: ((Array.isArray(a.strategicThemes) ? a.strategicThemes : []) as any) ?? [],
            confidence: a.confidence,
            crossReferences: null,
            modelUsed: a.modelUsed,
            analyzedAt: a.analyzedAt,
            sourceType: meta?.sourceType,
            engagement: meta?.engagement,
            signalTitle: meta?.title,
          };
        });

        const gossipAnalyses = gossipDbAnalyses.map((a) => {
          const meta = signalMetadata.get(a.signalId);
          return {
            id: a.id,
            signalId: a.signalId,
            agentPersona: "GOSSIP_GIRL" as const,
            summary: a.summary,
            keyFacts: ((Array.isArray(a.keyFacts) ? a.keyFacts : []) as any) ?? [],
            sentiment: (a.sentimentData as any) ?? {
              surface_reading: "neutral-surface" as const,
              tell_strength: a.confidence,
              key_phrases: [],
            },
            strategicThemes: ((Array.isArray(a.strategicThemes) ? a.strategicThemes : []) as any) ?? [],
            confidence: a.confidence,
            crossReferences: null,
            modelUsed: a.modelUsed,
            analyzedAt: a.analyzedAt,
            sourceType: meta?.sourceType,
            engagement: meta?.engagement,
            signalTitle: meta?.title,
          };
        });

        // Skip if no analyses
        if (analystAnalyses.length === 0 && gossipAnalyses.length === 0) {
          console.log(`  Skipping debate for ${item.inferenceId} (no analyses)`);
          continue;
        }

        // Generate debate
        const debateResult = await generateCrossSignalDebate(
          analystAnalyses,
          gossipAnalyses,
          item.themeLabel,
          item.companyName,
        );

        const transcript = JSON.stringify(debateResult.debate);
        const consensusReached =
          debateResult.debate.pointsOfAgreement.length > 0 &&
          debateResult.debate.pointsOfContention.length === 0;

        const finalConfidence =
          (debateResult.debate.analystPosition.confidence +
            debateResult.debate.gossipGirlPosition.tellStrength) /
          2;

        // Create debate record
        const debateRecord = await prisma.crossSignalDebate.create({
          data: {
            inferenceId: item.inferenceId,
            debateTranscript: transcript,
            consensusReached,
            finalConfidence,
            status: "ACTIVE",
            analystClaim: debateResult.debate.analystPosition.claim ?? "",
            analystEvidence: debateResult.debate.analystPosition.evidence ?? [],
            analystConfidence: debateResult.debate.analystPosition.confidence ?? 0.5,
            gossipClaim: debateResult.debate.gossipGirlPosition.claim ?? "",
            gossipEvidence: debateResult.debate.gossipGirlPosition.evidence ?? [],
            gossipTellStrength: debateResult.debate.gossipGirlPosition.tellStrength ?? 0.5,
            agreements: debateResult.debate.pointsOfAgreement ?? [],
            contentions: debateResult.debate.pointsOfContention ?? [],
            synthesisText: debateResult.debate.synthesis ?? "",
            evidenceProvenance: debateResult.evidenceProvenance,
          },
        });

        // Link debate to inference
        await prisma.inference.update({
          where: { id: item.inferenceId },
          data: { debateId: debateRecord.id },
        });

        debatesCreated++;
        console.log(`  Created debate for: ${item.themeLabel}`);
      } catch (error) {
        console.error(`  Failed to create debate for ${item.inferenceId}:`, error);
      }
    }

    console.log(`  Created ${debatesCreated} debates`);

    // Step 6: Generate cluster articles
    console.log("\nStep 6: Generating cluster articles...");
    let clusterArticlesCreated = 0;

    for (const item of newInferenceIds) {
      try {
        // Find the theme for this inference
        const theme = companyThemes.find(
          (t) => t.label === item.themeLabel && t.signalIds.some((id) => item.signalIds.includes(id))
        );
        if (!theme) continue;

        // Check if we should regenerate the article
        const existingArticles = await prisma.clusterArticle.findMany({
          where: { themeId: theme.themeId },
          select: { signalCount: true },
        });

        const lastSignalCount = existingArticles.length > 0
          ? Math.max(...existingArticles.map((a) => a.signalCount))
          : 0;

        const shouldRegenerate = lastSignalCount === 0 || item.signalIds.length >= lastSignalCount * 1.5;

        if (!shouldRegenerate) {
          console.log(`  Skipping article for ${theme.label} (no threshold crossed)`);
          continue;
        }

        // Load signals with their facts
        const signals = await prisma.signal.findMany({
          where: { id: { in: item.signalIds } },
          select: {
            id: true,
            title: true,
            sourceType: true,
            analyses: {
              select: { keyFacts: true },
            },
          },
        });

        const clusterData = {
          label: theme.label,
          summary: theme.label,
          signals: signals.map((s) => ({
            id: s.id,
            title: s.title,
            sourceType: s.sourceType,
            facts: s.analyses.flatMap((a) =>
              Array.isArray(a.keyFacts)
                ? a.keyFacts.map((f) =>
                    typeof f === "string" ? f : (f && typeof f === "object" && "text" in f ? f.text : String(f))
                  )
                : []
            ) as Array<string | { text?: string }>,
          })),
        };

        const company = await prisma.company.findUnique({
          where: { id: theme.companyId },
          select: { name: true, ticker: true },
        });

        if (!company) continue;

        const companyInfo = {
          name: company.name,
          ticker: company.ticker || undefined,
        };

        // Generate articles for both personas
        for (const [persona, config] of [
          ["ANALYST", ANALYST_CONFIG],
          ["GOSSIP_GIRL", GOSSIP_GIRL_CONFIG],
        ] as const) {
          try {
            const article = await generateClusterArticle(
              clusterData,
              companyInfo,
              config
            );

            await prisma.clusterArticle.upsert({
              where: {
                themeId_agentPersona: {
                  themeId: theme.themeId,
                  agentPersona: persona,
                },
              },
              update: {
                title: article.title,
                slug: article.slug,
                summary: article.summary,
                body: article.body,
                signalCount: item.signalIds.length,
                status: "PUBLISHED",
                publishedAt: now,
              },
              create: {
                themeId: theme.themeId,
                companyId: theme.companyId,
                title: article.title,
                slug: article.slug,
                summary: article.summary,
                body: article.body,
                agentPersona: persona,
                signalCount: item.signalIds.length,
                status: "PUBLISHED",
                publishedAt: now,
              },
            });

            clusterArticlesCreated++;
            console.log(`  Created ${persona} article: ${article.title}`);
          } catch (error) {
            console.error(`  Failed to create ${persona} article:`, error);
          }
        }
      } catch (error) {
        console.error(`  Failed to create articles for ${item.inferenceId}:`, error);
      }
    }

    console.log(`  Created ${clusterArticlesCreated} cluster articles`);

    console.log("\n=== Correlation complete ===\n");
    console.log(`Themes updated:          ${themesUpdated}`);
    console.log(`Inferences created:      ${inferencesCreated}`);
    console.log(`Debates created:         ${debatesCreated}`);
    console.log(`Cluster articles:        ${clusterArticlesCreated}`);

    // Show sample results
    if (themesUpdated > 0) {
      const sampleThemes = await prisma.signalTheme.findMany({
        take: 5,
        select: {
          id: true,
          label: true,
          status: true,
          momentum: true,
          company: { select: { name: true } },
        },
      });
      
      console.log("\n=== Sample themes ===\n");
      for (const t of sampleThemes) {
        console.log(`  ${t.label} (${t.company.name})`);
        console.log(`    Status: ${t.status} | Momentum: ${t.momentum.toFixed(2)}`);
      }
    }

    if (inferencesCreated > 0) {
      const sampleInferences = await prisma.inference.findMany({
        take: 5,
        select: {
          id: true,
          title: true,
          confidence: true,
          company: { select: { name: true } },
        },
      });
      
      console.log("\n=== Sample inferences ===\n");
      for (const i of sampleInferences) {
        console.log(`  ${i.title}`);
        console.log(`    Company: ${i.company.name} | Confidence: ${i.confidence.toFixed(2)}`);
      }
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error("\n❌ Correlation failed:\n");
    console.error(error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
