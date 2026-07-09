/**
 * Cross-signal correlation engine.
 * Groups signals by theme, detects convergence across source types,
 * and maintains SignalTheme records with momentum tracking.
 */

import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  generateEmbedding,
  cosineSimilarity,
} from "@/lib/nlp/embedding-generator";
import { calculateSignalWeight } from "@/lib/ai/confidence";
import type { SourceType } from "@/lib/ai/types";
import { loadSignalEmbeddings } from "@/lib/nlp/embedding-store";
import type { Prisma } from "@prisma/client";

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

export const correlateSignalsFunction = inngest.createFunction(
  {
    id: "correlate-signals",
    concurrency: { limit: 1, key: "correlate-signals" },
    triggers: [
      { cron: "0 4 * * *" }, // Daily at 4:00 AM UTC
      { event: "correlation/manual.trigger" }, // Manual trigger from admin UI
    ],
    retries: 2,
    timeouts: { finish: "20m" },
  },
  async ({ step, event }) => {
    const data = event.data as { recentOnly?: boolean };
    const recentOnly = data.recentOnly === true;
    const log = logger.child({ function: "correlate-signals", recentOnly });
    log.info("correlation.start");

    const now = new Date();

    // Step 1: Get recent analyses (last 7 days, or last 24h if recentOnly) grouped by company
    const recentAnalyses = await step.run("load-recent-analyses", async () => {
      const cutoffDate = recentOnly
        ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
        : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const analyses = await prisma.analysis.findMany({
        where: {
          analyzedAt: { gte: cutoffDate },
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
          // Batch: load all signals once, then update in parallel
          try {
            const signalsForCluster = await prisma.signal.findMany({
              where: { id: { in: cluster.signalIds } },
              select: { id: true, clusterId: true },
            });

            await Promise.all(
              signalsForCluster.map((signal) =>
                prisma.signal.update({
                  where: { id: signal.id },
                  data: {
                    themes: { connect: { id: themeId } },
                    // Only set clusterId if signal doesn't already have one
                    ...(signal.clusterId ? {} : { clusterId: themeId }),
                  },
                }).catch((err) => {
                  log.warn("Failed to link signal to theme", {
                    signalId: signal.id,
                    themeId,
                    error: err instanceof Error ? err.message : String(err),
                  });
                })
              )
            );
          } catch (err) {
            log.warn("Failed to batch-link signals to theme", {
              themeId,
              signalCount: cluster.signalIds.length,
              error: err instanceof Error ? err.message : String(err),
            });
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

    log.info("correlation.complete", { themesUpdated });

    return { success: true, themesUpdated };
  },
);
