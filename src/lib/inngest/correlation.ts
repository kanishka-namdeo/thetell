/**
 * Cross-signal correlation engine.
 * Groups signals by theme, detects convergence across source types,
 * and generates strategic inferences when multiple sources agree.
 */

import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  generateEmbedding,
  cosineSimilarity,
} from "@/lib/nlp/embedding-generator";
import { getProviderWithFailover } from "@/lib/ai/provider";
import { generateCrossSignalDebate } from "@/lib/ai/agent/cross-signal-debate";
import { calculateSignalWeight } from "@/lib/ai/confidence";
import { generateClusterArticle } from "@/lib/ai/agent/cluster-article-generator";
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from "@/lib/ai/agent/personas";
import type { SourceType } from "@/lib/ai/types";
import type {
  AnalystFact,
  AnalystSentiment,
  AnalystTheme,
  GossipFact,
  GossipSentiment,
  GossipTheme,
} from "@/lib/ai/agent/types";
import { z } from "zod";
import { runWithTraceAsync } from "@/lib/ai/trace-context";
import type { Prisma } from "@prisma/client";

const INFERENCE_TITLE_SCHEMA = z.object({
  title: z.string().describe("A concise, news-style headline for the inference"),
  summary: z
    .string()
    .describe("A 2-3 sentence executive summary of the cross-signal inference"),
});

export interface ThemeCluster {
  label: string;
  signalIds: string[];
  sourceTypes: string[];
  companyIds: string[];
  avgEmbedding: number[];
}

export interface MomentumResult {
  momentum: number;
  status: "EMERGING" | "ACCELERATING" | "PEAKED" | "FADING" | "RESOLVED";
}

import { loadSignalEmbeddings } from "@/lib/nlp/embedding-store";

/**
 * Compute cluster embedding centroid by averaging signal embeddings.
 */
export async function computeClusterCentroid(signalIds: string[]): Promise<number[] | null> {
  if (signalIds.length === 0) return null;

  const embeddingMap = await loadSignalEmbeddings(signalIds);
  const embeddings = Array.from(embeddingMap.values());

  if (embeddings.length === 0) return null;

  // Average all embeddings
  const dimension = embeddings[0].length;
  const centroid = new Array(dimension).fill(0);

  for (const embedding of embeddings) {
    if (embedding.length !== dimension) continue;
    for (let i = 0; i < dimension; i++) {
      centroid[i] += embedding[i];
    }
  }

  for (let i = 0; i < dimension; i++) {
    centroid[i] /= embeddings.length;
  }

  return centroid;
}

/**
 * Check if cluster article should be regenerated based on signal count thresholds.
 */
function shouldRegenerateClusterArticle(
  currentSignalCount: number,
  lastArticleSignalCount: number
): boolean {
  const thresholds = [3, 5, 10, 20];
  
  // Check if we crossed a threshold
  for (const threshold of thresholds) {
    if (lastArticleSignalCount < threshold && currentSignalCount >= threshold) {
      return true;
    }
  }
  
  // Also regenerate if signal count increased by 50% or more
  if (currentSignalCount >= lastArticleSignalCount * 1.5) {
    return true;
  }
  
  return false;
}

/**
 * Cluster theme labels by embedding similarity.
 * Groups themes with cosine similarity > 0.75 into clusters.
 */
export async function clusterThemes(
  analyses: Array<{
    signalId: string;
    strategicThemes: Array<{ label: string }>;
    sourceType: string;
    companyId: string;
  }>,
): Promise<ThemeCluster[]> {
  const allThemes: Array<{
    label: string;
    signalId: string;
    sourceType: string;
    companyId: string;
    embedding?: number[];
  }> = [];

  for (const analysis of analyses) {
    const themes = Array.isArray(analysis.strategicThemes)
      ? analysis.strategicThemes
      : [];
    for (const theme of themes) {
      if (theme.label && typeof theme.label === "string") {
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

  // Generate embeddings for each unique theme label
  const uniqueLabels = [...new Set(allThemes.map((t) => t.label))];
  const labelEmbeddings = new Map<string, number[]>();

  for (const label of uniqueLabels) {
    try {
      const embedding = await generateEmbedding(label);
      labelEmbeddings.set(label, embedding);
    } catch {
      // Skip themes that fail embedding generation
    }
  }

  // Assign embeddings
  for (const theme of allThemes) {
    theme.embedding = labelEmbeddings.get(theme.label);
  }

  // Cluster by cosine similarity > 0.75
  const clusters: ThemeCluster[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < allThemes.length; i++) {
    if (assigned.has(i) || !allThemes[i].embedding) continue;

    const cluster: ThemeCluster = {
      label: allThemes[i].label,
      signalIds: [allThemes[i].signalId],
      sourceTypes: [allThemes[i].sourceType],
      companyIds: [allThemes[i].companyId],
      avgEmbedding: [...allThemes[i].embedding!],
    };
    assigned.add(i);

    for (let j = i + 1; j < allThemes.length; j++) {
      if (assigned.has(j) || !allThemes[j].embedding) continue;

      const sim = cosineSimilarity(
        allThemes[i].embedding!,
        allThemes[j].embedding!,
      );
      if (sim > 0.75) {
        cluster.signalIds.push(allThemes[j].signalId);
        cluster.sourceTypes.push(allThemes[j].sourceType);
        cluster.companyIds.push(allThemes[j].companyId);
        assigned.add(j);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

/**
 * Calculate momentum based on signal count velocity, agent agreement,
 * source diversity, confidence weighting, and source-type credibility.
 */
export function calculateMomentum(
  signals: Array<{
    scrapedAt: Date;
    publishedAt?: Date | null;
    sourceType: string;
    confidence?: number;
    engagement?: Record<string, unknown> | null;
  }>,
  now: Date,
  agentAgreement?: boolean,
): MomentumResult {
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Helper: prefer publishedAt over scrapedAt for temporal accuracy
  const getEffectiveDate = (s: { scrapedAt: Date; publishedAt?: Date | null }): Date => {
    return s.publishedAt ? new Date(s.publishedAt) : new Date(s.scrapedAt);
  };

  // Weighted velocity calculation
  const thisWeekWeight = signals
    .filter((s) => getEffectiveDate(s) >= oneWeekAgo)
    .reduce((sum, s) => {
      const weight = calculateSignalWeight(s.sourceType as SourceType, s.engagement);
      return sum + weight;
    }, 0);

  const lastWeekWeight = signals
    .filter(
      (s) =>
        getEffectiveDate(s) >= twoWeeksAgo &&
        getEffectiveDate(s) < oneWeekAgo,
    )
    .reduce((sum, s) => {
      const weight = calculateSignalWeight(s.sourceType as SourceType, s.engagement);
      return sum + weight;
    }, 0);

  let momentum: number;
  if (lastWeekWeight === 0) {
    momentum = thisWeekWeight > 0 ? 2.0 : 0;
  } else {
    momentum = (thisWeekWeight - lastWeekWeight) / lastWeekWeight;
  }

  // Apply bonuses
  let multiplier = 1.0;

  // Agent agreement bonus: if both agents identified the same theme
  if (agentAgreement) {
    multiplier *= 1.3;
  }

  // Source diversity bonus: signals from 3+ source types
  const uniqueSourceTypes = new Set(signals.map((s) => s.sourceType));
  if (uniqueSourceTypes.size >= 3) {
    multiplier *= 1.2;
  }

  // Confidence weighting: high-confidence signals (>=0.7) contribute 1.5x
  const highConfidenceCount = signals.filter(
    (s) => s.confidence && s.confidence >= 0.7,
  ).length;
  if (highConfidenceCount > 0) {
    const confidenceRatio = highConfidenceCount / signals.length;
    multiplier *= 1.0 + (confidenceRatio * 0.5); // Up to 1.5x bonus
  }

  momentum *= multiplier;

  let status: MomentumResult["status"];
  if (momentum > 1.0) status = "PEAKED";
  else if (momentum > 0.5) status = "ACCELERATING";
  else if (momentum >= 0) status = "EMERGING";
  else status = "FADING";

  return { momentum, status };
}

/**
 * Determine cluster status from momentum, signal count, and inactivity.
 */
export function computeStatus(
  momentum: number,
  signalCount: number,
  daysSinceLastSignal: number,
): MomentumResult["status"] {
  if (daysSinceLastSignal > 60 && momentum < 0.1) return "RESOLVED";
  if (daysSinceLastSignal > 30 && momentum < 0.3) return "FADING";
  if (momentum >= 0.8 && signalCount >= 5) return "PEAKED";
  if (momentum >= 0.5) return "ACCELERATING";
  return "EMERGING";
}

/**
 * Generate an inference using LLM for a convergent theme cluster.
 */
export async function generateInferenceTitle(
  cluster: ThemeCluster,
  companyName: string,
  sourceTypes: string[],
): Promise<{ title: string; summary: string }> {
  const { provider } = getProviderWithFailover("openai");
  const uniqueSourceTypes = [...new Set(sourceTypes)].join(", ");

  const messages = [
    {
      role: "system" as const,
      content:
        "You are a corporate intelligence analyst. Generate a concise inference title and summary based on multiple converging signal types about a company.",
    },
    {
      role: "user" as const,
      content: `Company: ${companyName}
Theme: ${cluster.label}
Source types converging: ${uniqueSourceTypes}
Number of supporting signals: ${cluster.signalIds.length}

Generate a title (one line) and summary (2-3 sentences) for this cross-signal inference.`,
    },
  ];

  try {
    const result = await provider.completeStructured(
      messages,
      INFERENCE_TITLE_SCHEMA,
      { temperature: 0.3 },
    );
    return { title: result.title, summary: result.summary };
  } catch {
    return {
      title: `Cross-signal pattern detected: ${cluster.label}`,
      summary: `Multiple source types (${uniqueSourceTypes}) have converged on the theme "${cluster.label}" for ${companyName}. ${cluster.signalIds.length} signals support this inference.`,
    };
  }
}

export const correlateSignalsFunction = inngest.createFunction(
  {
    id: "correlate-signals",
    triggers: [
      { cron: "0 4 * * *" }, // Daily at 4:00 AM UTC
      { event: "correlation/manual.trigger" }, // Manual trigger from admin UI
    ],
    retries: 2,
    timeouts: { finish: "20m" },
  },
  async ({ step, event: _event }) => {
    return runWithTraceAsync(
      {
        sessionId: "correlation-job",
        traceName: "correlate-signals",
      },
      async () => {
        const log = logger.child({ function: "correlate-signals" });
        log.info("correlation.start");

    const now = new Date();

    // Step 1: Get recent analyses (last 7 days) grouped by company
    const recentAnalyses = await step.run("load-recent-analyses", async () => {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const analyses = await prisma.analysis.findMany({
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
        take: 1000,
      });

      log.info("correlation.analyses_loaded", { count: analyses.length });
      return analyses;
    });

    if (recentAnalyses.length === 0) {
      log.info("correlation.no_analyses");
      return { success: true, inferencesCreated: 0, themesUpdated: 0 };
    }

    // Step 2: Cluster themes across all analyses
    const clusters = await step.run("cluster-themes", async () => {
      const analysisData = recentAnalyses.map((a) => ({
        signalId: a.signalId,
        strategicThemes: Array.isArray(a.strategicThemes)
          ? (a.strategicThemes as Array<{ label: string }>)
          : [],
        sourceType: a.signal.sourceType,
        companyId: a.signal.companyId,
      }));

      const result = await clusterThemes(analysisData);
      log.info("correlation.themes_clustered", {
        clusterCount: result.length,
        totalThemes: analysisData.reduce(
          (sum, a) => sum + a.strategicThemes.length,
          0,
        ),
      });
      return result;
    });

    // Step 3: For each company, create/update SignalTheme records
    let themesUpdated = 0;

    const companyThemes = await step.run("update-themes", async () => {
      const results: Array<{
        themeId: string;
        companyId: string;
        label: string;
        signalIds: string[];
        sourceTypes: string[];
      }> = [];

      // Group clusters by company
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
        for (const cluster of companyClusters) {
          // Find or create SignalTheme
          const existingTheme = await prisma.signalTheme.findFirst({
            where: {
              companyId,
              label: { contains: cluster.label, mode: "insensitive" },
            },
          });

          // Calculate momentum for this theme with enhanced bonuses
          const signals = await prisma.signal.findMany({
            where: { id: { in: cluster.signalIds } },
            select: { id: true, scrapedAt: true, publishedAt: true, sourceType: true, engagement: true },
          });

          // Load per-signal confidence for confidence weighting
          const signalAnalyses = await prisma.analysis.findMany({
            where: { signalId: { in: cluster.signalIds } },
            select: { signalId: true, confidence: true },
          });
          const confidenceBySignal = new Map<string, number>();
          for (const a of signalAnalyses) {
            const existing = confidenceBySignal.get(a.signalId) ?? 0;
            confidenceBySignal.set(a.signalId, Math.max(existing, a.confidence));
          }

          // Check agent agreement: both ANALYST and GOSSIP_GIRL identified this theme
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
            publishedAt: s.publishedAt,
            sourceType: s.sourceType,
            id: s.id,
            confidence: confidenceBySignal.get(s.id),
            engagement: s.engagement as Record<string, unknown> | null,
          }));
          const { momentum: rawMomentum } = calculateMomentum(
            enrichedSignals,
            now,
            agentAgreement,
          );

          // Time-based momentum decay: no decay for first 7 days, then exponential
          const latestSignalDate = signals.reduce((latest, s) => {
            const d = s.publishedAt ?? s.scrapedAt;
            return d > latest ? d : latest;
          }, signals[0]?.scrapedAt ?? now);
          const daysSinceLastSignal = Math.floor(
            (now.getTime() - latestSignalDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          const decayFactor = Math.exp(-0.1 * Math.max(0, daysSinceLastSignal - 7));
          const momentum = rawMomentum * decayFactor;

          // Automatic status lifecycle based on decayed momentum
          const status = computeStatus(momentum, signals.length, daysSinceLastSignal);

          // Compute cluster embedding centroid
          const clusterCentroid = await computeClusterCentroid(cluster.signalIds);

          let themeId: string;

          if (existingTheme) {
            // Track momentum history (keep last 30 daily values)
            const existingSummary = (existingTheme.clusterSummary as Record<string, unknown>) ?? {};
            const momentumHistory = ((existingSummary.momentumHistory as number[]) ?? []).slice(-29);
            momentumHistory.push(momentum);
            existingSummary.momentumHistory = momentumHistory;

            await prisma.signalTheme.update({
              where: { id: existingTheme.id },
              data: {
                momentum,
                status,
                lastUpdated: now,
                clusterSummary: existingSummary as Prisma.InputJsonValue,
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
                clusterSummary: { momentumHistory: [momentum] } as Prisma.InputJsonValue,
                ...(clusterCentroid && { embedding: clusterCentroid }),
              },
            });
            themeId = created.id;
          }

          // Link signals to theme (many-to-many via connect + clusterId for one-to-many)
          for (const signalId of cluster.signalIds) {
            try {
              await prisma.signal.update({
                where: { id: signalId },
                data: {
                  themes: {
                    connect: { id: themeId },
                  },
                  clusterId: themeId, // Set clusterId for clusteredSignals relation
                },
              });
            } catch (err) {
              // Signal may already be connected or other error
              log.warn("Failed to link signal to theme", {
                signalId,
                themeId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }

          results.push({
            themeId,
            companyId,
            label: cluster.label,
            signalIds: cluster.signalIds,
            sourceTypes: cluster.sourceTypes,
          });
          themesUpdated++;
        }
      }

      log.info("correlation.themes_updated", { count: themesUpdated });
      return results;
    });

    // Step 4: Generate inferences for high-convergence themes
    // Returns inference IDs that need cross-signal debates
    let inferencesCreated = 0;
    const newInferenceIds: Array<{
      inferenceId: string;
      themeLabel: string;
      companyName: string;
      signalIds: string[];
    }> = [];

    const inferenceResults = await step.run("generate-inferences", async () => {
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
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
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

        // Load all analyses for the theme's signals to build agentAnalyses + confidence
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

        // Cross-signal convergence bonus: more source types = higher confidence
        const sourceTypeCount = uniqueSourceTypes.size;
        const convergenceBonus = Math.min(
          (sourceTypeCount - 1) * 0.05,
          0.15,
        ); // Up to +0.15 for 4+ source types
        const finalConfidence = Math.min(avgConfidence + convergenceBonus, 1.0);

        // Build per-agent summaries for agentAnalyses field
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

        log.info("correlation.inference_created", {
          themeId: theme.themeId,
          title,
          signalCount: theme.signalIds.length,
          sourceTypeCount: uniqueSourceTypes.size,
          convergenceBonus,
          finalConfidence,
        });
      }

      return newInferenceIds;
    });

    // Step 5: Generate cross-signal debates for new inferences
    let debatesCreated = 0;

    await step.run("generate-cross-signal-debates", async () => {
      for (const item of inferenceResults) {
        try {
          // Load signal metadata (sourceType, engagement, title, publishedAt) for weighting and provenance
          const signals = await prisma.signal.findMany({
            where: { id: { in: item.signalIds } },
            select: { id: true, sourceType: true, engagement: true, title: true, publishedAt: true },
          });
          const signalMetadata = new Map(
            signals.map((s) => [
              s.id,
              {
                sourceType: s.sourceType as SourceType,
                engagement: s.engagement as Record<string, unknown> | null,
                title: s.title,
                publishedAt: s.publishedAt,
              },
            ]),
          );

          // Load all Analyst analyses for this theme's signals
          const analystDbAnalyses = await prisma.analysis.findMany({
            where: {
              signalId: { in: item.signalIds },
              agentPersona: "ANALYST",
            },
          });

          // Load all Gossip Girl analyses for this theme's signals
          const gossipDbAnalyses = await prisma.analysis.findMany({
            where: {
              signalId: { in: item.signalIds },
              agentPersona: "GOSSIP_GIRL",
            },
          });

          // Convert DB records to AgentAnalysis shape with source metadata
          const analystAnalyses = analystDbAnalyses.map((a) => {
            const meta = signalMetadata.get(a.signalId);
            return {
              id: a.id,
              signalId: a.signalId,
              agentPersona: "ANALYST" as const,
              summary: a.summary,
              keyFacts: ((Array.isArray(a.keyFacts) ? a.keyFacts : []) as AnalystFact[]) ?? [],
              sentiment: (a.sentimentData as AnalystSentiment) ?? {
                sentiment: a.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL",
                strength: undefined,
                confidence: a.confidence,
                key_phrases: [],
              },
              strategicThemes: ((Array.isArray(a.strategicThemes) ? a.strategicThemes : []) as AnalystTheme[]) ?? [],
              confidence: a.confidence,
              crossReferences: null,
              modelUsed: a.modelUsed,
              analyzedAt: a.analyzedAt,
              sourceType: meta?.sourceType,
              engagement: meta?.engagement,
              signalTitle: meta?.title,
              publishedAt: meta?.publishedAt,
            };
          });

          const gossipAnalyses = gossipDbAnalyses.map((a) => {
            const meta = signalMetadata.get(a.signalId);
            return {
              id: a.id,
              signalId: a.signalId,
              agentPersona: "GOSSIP_GIRL" as const,
              summary: a.summary,
              keyFacts: ((Array.isArray(a.keyFacts) ? a.keyFacts : []) as GossipFact[]) ?? [],
              sentiment: (a.sentimentData as GossipSentiment) ?? {
                surface_reading: "neutral-surface" as const,
                tell_strength: a.confidence,
                key_phrases: [],
              },
              strategicThemes: ((Array.isArray(a.strategicThemes) ? a.strategicThemes : []) as GossipTheme[]) ?? [],
              confidence: a.confidence,
              crossReferences: null,
              modelUsed: a.modelUsed,
              analyzedAt: a.analyzedAt,
              sourceType: meta?.sourceType,
              engagement: meta?.engagement,
              signalTitle: meta?.title,
              publishedAt: meta?.publishedAt,
            };
          });

          // Skip if no analyses from either agent
          if (analystAnalyses.length === 0 && gossipAnalyses.length === 0) {
            log.warn("correlation.debate_skipped_no_analyses", {
              inferenceId: item.inferenceId,
            });
            continue;
          }

          // Generate the cross-signal debate with provenance tracking
          const debateResult = await generateCrossSignalDebate(
            analystAnalyses,
            gossipAnalyses,
            item.themeLabel,
            item.companyName,
          );

          // Build a readable transcript from the debate structure
          const transcript = JSON.stringify(debateResult.debate);

          // Determine consensus: both agents agree on key points
          const consensusReached =
            debateResult.debate.pointsOfAgreement.length > 0 &&
            debateResult.debate.pointsOfContention.length === 0;

          // Final confidence from the debate (average of both positions)
          const finalConfidence =
            (debateResult.debate.analystPosition.confidence +
              debateResult.debate.gossipGirlPosition.tellStrength) /
            2;

          // Create the CrossSignalDebate record with evidence provenance
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
          log.info("correlation.cross_signal_debate_created", {
            inferenceId: item.inferenceId,
            analystCount: analystAnalyses.length,
            gossipCount: gossipAnalyses.length,
            consensusReached,
            finalConfidence,
            evidenceProvenanceEntries: Object.keys(debateResult.evidenceProvenance).length,
          });
        } catch (error) {
          log.error("correlation.cross_signal_debate_error", {
            inferenceId: item.inferenceId,
            error: String(error),
          });
          // Continue with other inferences — debate failure is non-fatal
        }
      }
    });

    // Step 6: Generate cluster articles for themes with inferences
    let clusterArticlesCreated = 0;

    await step.run("generate-cluster-articles", async () => {
      for (const item of inferenceResults) {
        try {
          // Find the theme for this inference by looking up via companyThemes
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

          if (!shouldRegenerateClusterArticle(item.signalIds.length, lastSignalCount)) {
            log.debug("correlation.cluster_article_skipped", {
              themeId: theme.themeId,
              currentCount: item.signalIds.length,
              lastCount: lastSignalCount,
            });
            continue;
          }

          // Load signals with their facts for article generation
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
            summary: `${theme.label}: Analysis of ${signals.length} related signals`,
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
              log.info("correlation.cluster_article_created", {
                themeId: theme.themeId,
                persona,
                signalCount: item.signalIds.length,
                groundingScore: article.groundingScore,
              });
            } catch (error) {
              log.error("correlation.cluster_article_generation_failed", {
                themeId: theme.themeId,
                persona,
                error: String(error),
              });
            }
          }
        } catch (error) {
          log.error("correlation.cluster_article_error", {
            inferenceId: item.inferenceId,
            error: String(error),
          });
        }
      }
    });

    log.info("correlation.complete", {
      themesUpdated,
      inferencesCreated,
      debatesCreated,
      clusterArticlesCreated,
    });

    return { success: true, themesUpdated, inferencesCreated, debatesCreated, clusterArticlesCreated };
      } // close runWithTraceAsync callback
    ); // close runWithTraceAsync
  },
);
