/**
 * Cluster summary updates.
 *
 * Provides two update strategies:
 * 1. Batch regeneration (updateClusterSummary) - regenerates from all signals
 * 2. Incremental merge (updateClusterWithSignal) - merges new signal's analysis
 *
 * Incremental updates are used for cluster-routed signals to avoid re-analyzing
 * all signals when a new one arrives.
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getProviderWithFailover } from "../provider";
import type { ProviderName } from "../provider";
import { z } from "zod";
import {
  clusterCache,
  clusterSummaryKey,
  CLUSTER_CACHE_TTL,
} from "@/lib/cache/cluster-cache";
import { generateEmbedding, cosineSimilarity } from "@/lib/nlp/embedding-generator";
import type { ClusterAnalysisResult } from "./cluster-analysis";

const DEBOUNCE_WINDOW_MS = 60_000;

const ClusterSummarySchema = z.object({
  description: z.string(),
  keyThemes: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
});

export interface ClusterUpdateInput {
  themeId: string;
  signals: Array<{
    id: string;
    title: string;
    sourceType: string;
    facts: string[];
  }>;
}

export interface ClusterUpdateResult {
  updated: boolean;
  skipped: boolean;
  reason?: string;
  description?: string;
  keyThemes?: string[];
}

/**
 * Update a cluster's summary from its current signals.
 *
 * Returns { skipped: true } when:
 * - The cluster was updated within the debounce window
 * - Another writer updated the cluster between our read and write
 * - The cluster has fewer than 2 signals (not worth summarising)
 */
export async function updateClusterSummary(
  input: ClusterUpdateInput,
  providerName: ProviderName = "openai",
  model?: string
): Promise<ClusterUpdateResult> {
  const log = logger.child({ themeId: input.themeId });

  const cluster = await prisma.signalTheme.findUnique({
    where: { id: input.themeId },
    select: { id: true, lastUpdated: true, label: true },
  });

  if (!cluster) {
    log.warn("cluster_update.cluster_not_found");
    return { updated: false, skipped: true, reason: "cluster_not_found" };
  }

  const withinDebounce =
    Date.now() - cluster.lastUpdated.getTime() < DEBOUNCE_WINDOW_MS;
  if (withinDebounce) {
    log.debug("cluster_update.debounced");
    return { updated: false, skipped: true, reason: "debounced" };
  }

  if (input.signals.length < 2) {
    log.debug("cluster_update.too_few_signals");
    return { updated: false, skipped: true, reason: "too_few_signals" };
  }

  const snapshotUpdatedAt = cluster.lastUpdated;

  try {
    const summary = await generateSummary(input, providerName, model);

    const updateResult = await prisma.signalTheme.updateMany({
      where: {
        id: input.themeId,
        lastUpdated: snapshotUpdatedAt,
      },
      data: {
        description: summary.description,
        clusterSummary: {
          keyThemes: summary.keyThemes,
          openQuestions: summary.openQuestions,
          signalCount: input.signals.length,
          generatedAt: new Date().toISOString(),
        },
        lastAnalyzedAt: new Date(),
      },
    });

    if (updateResult.count === 0) {
      log.warn("cluster_update.optimistic_lock_failed");
      return { updated: false, skipped: true, reason: "optimistic_lock_failed" };
    }

    clusterCache.set(
      clusterSummaryKey(input.themeId),
      summary,
      CLUSTER_CACHE_TTL.SUMMARY
    );

    log.info("cluster_update.complete", {
      signalCount: input.signals.length,
      keyThemeCount: summary.keyThemes.length,
    });

    return {
      updated: true,
      skipped: false,
      description: summary.description,
      keyThemes: summary.keyThemes,
    };
  } catch (error) {
    log.error("cluster_update.failed", { error: String(error) });
    throw error;
  }
}

async function generateSummary(
  input: ClusterUpdateInput,
  providerName: ProviderName,
  model?: string
) {
  const { provider } = getProviderWithFailover(providerName);

  const signalLines = input.signals
    .map(
      (s) =>
        `- [${s.sourceType}] ${s.title}${
          s.facts.length > 0 ? ` — ${s.facts.slice(0, 3).join("; ")}` : ""
        }`
    )
    .join("\n");

  const messages = [
    {
      role: "system" as const,
      content:
        "You are a corporate intelligence analyst. Summarise a cluster of related signals about a company into a concise description, key strategic themes, and open questions. Return structured JSON.",
    },
    {
      role: "user" as const,
      content: `Cluster signals:\n${signalLines}\n\nRespond with JSON: { description, keyThemes[], openQuestions[] }`,
    },
  ];

  const result = await provider.completeStructured(
    messages,
    ClusterSummarySchema,
    { model, temperature: 0.4 }
  );

  return result;
}

// =============================================================================
// INCREMENTAL UPDATE — merge new signal's analysis into existing cluster
// =============================================================================

/** Similarity threshold for fact deduplication */
const FACT_DEDUP_SIMILARITY = 0.85;

/** Similarity threshold for theme deduplication */
const THEME_DEDUP_SIMILARITY = 0.80;

export interface IncrementalUpdateResult {
  updatedSummary: Record<string, unknown>;
  novelFactsAdded: number;
  novelThemesAdded: number;
  previousSignalCount: number;
  newSignalCount: number;
}

/**
 * Incrementally update a cluster with a new signal's analysis.
 *
 * This function merges the new signal's facts and themes into the existing
 * cluster summary, deduplicating by text similarity. It determines whether
 * cluster article regeneration is needed based on thresholds.
 *
 * @param themeId - The cluster/theme ID to update
 * @param signalId - The signal being added to the cluster
 * @param analysis - The lightweight cluster analysis result
 * @param company - Company info for logging/context
 * @returns Update result with regeneration decision
 */
export async function updateClusterWithSignal(
  themeId: string,
  signalId: string,
  analysis: ClusterAnalysisResult,
  company: { id: string; name: string }
): Promise<IncrementalUpdateResult> {
  const log = logger.child({ themeId, signalId, function: "updateClusterWithSignal" });

  log.info("cluster_incremental_update.start");

  // Load existing cluster with summary and check if signal is already linked
  const [theme, existingSignal] = await Promise.all([
    prisma.signalTheme.findUnique({
      where: { id: themeId },
      include: {
        _count: { select: { clusteredSignals: true } },
      },
    }),
    prisma.signal.findUnique({
      where: { id: signalId },
      select: { clusterId: true },
    }),
  ]);

  if (!theme) {
    throw new Error(`Theme not found: ${themeId}`);
  }

  // Check if signal is already in this cluster to prevent double-counting on re-analysis
  const signalAlreadyInCluster = existingSignal?.clusterId === themeId;

  const existingSummary = (theme.clusterSummary as Record<string, unknown>) ?? {};
  const existingFacts = ((existingSummary.facts as Array<{ text: string }>) ?? []);
  const existingThemes = ((existingSummary.themes as Array<{ label: string; evidence: string[] }>) ?? []);
  const existingFactEmbeddings = ((existingSummary.factEmbeddings as Array<number[]>) ?? []);
  const previousSignalCount = theme._count.clusteredSignals;

  // Deduplicate new facts against existing facts using real embeddings
  const novelFacts = await deduplicateFacts(analysis.keyFacts, existingFacts, existingFactEmbeddings);

  // Deduplicate new themes against existing themes using real embeddings
  const novelThemes = await deduplicateThemes(analysis.strategicThemes, existingThemes);

  // Merge facts and themes
  const updatedFacts = [
    ...existingFacts,
    ...novelFacts.map((f) => ({ text: f.text })),
  ];

  // Generate embeddings for novel facts and cache them alongside facts
  const novelFactEmbeddings = await Promise.all(
    novelFacts.map(async (f) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`Embedding timeout for fact: ${f.text.slice(0, 50)}`)), 35000);
        });
        return await Promise.race([
          generateEmbedding(f.text),
          timeoutPromise
        ]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    })
  ).catch((err) => {
    log.warn("cluster_update.embedding_timeout", { error: String(err) });
    return [];
  });
  
  // Cap fact embeddings at 500 to prevent unbounded growth
  const MAX_FACT_EMBEDDINGS = 500;
  const allFactEmbeddings = [...existingFactEmbeddings, ...novelFactEmbeddings];
  const updatedFactEmbeddings = allFactEmbeddings.length > MAX_FACT_EMBEDDINGS
    ? allFactEmbeddings.slice(allFactEmbeddings.length - MAX_FACT_EMBEDDINGS)
    : allFactEmbeddings;

  const updatedThemes = [
    ...existingThemes,
    ...novelThemes.map((t) => ({ label: t.label, evidence: t.evidence })),
  ];

  // Build updated summary
  const updatedSummary: Record<string, unknown> = {
    ...existingSummary,
    facts: updatedFacts,
    factEmbeddings: updatedFactEmbeddings,
    themes: updatedThemes,
    signalCount: signalAlreadyInCluster ? previousSignalCount : previousSignalCount + 1,
    lastUpdated: new Date().toISOString(),
    lastSignalId: signalId,
    companyName: company.name,
    aggregatedConfidence: calculateAggregatedConfidence(
      (existingSummary.aggregatedConfidence as number) ?? 0.5,
      analysis.confidence,
      signalAlreadyInCluster ? previousSignalCount : previousSignalCount + 1
    ),
  };

  // Update the database with optimistic locking
  const snapshotUpdatedAt = theme.lastUpdated;
  
  // Wrap cluster summary update and signal linking in a transaction
  await prisma.$transaction(async (tx) => {
    const updateResult = await tx.signalTheme.updateMany({
      where: { id: themeId, lastUpdated: snapshotUpdatedAt },
      data: {
        clusterSummary: JSON.parse(JSON.stringify(updatedSummary)),
        lastAnalyzedAt: new Date(),
        lastUpdated: new Date(),
      },
    });

    if (updateResult.count === 0) {
      log.warn("cluster_incremental_update.optimistic_lock_failed");
      throw new Error("Optimistic lock failed: cluster was updated concurrently");
    }

    // Link signal to cluster (only if not already linked)
    if (!signalAlreadyInCluster) {
      await tx.signal.update({
        where: { id: signalId },
        data: { clusterId: themeId },
      });
    }
  });

  // Invalidate cache
  clusterCache.invalidate(clusterSummaryKey(themeId));

  const finalSignalCount = signalAlreadyInCluster ? previousSignalCount : previousSignalCount + 1;

  log.info("cluster_incremental_update.complete", {
    previousSignalCount,
    newSignalCount: finalSignalCount,
    novelFactsAdded: novelFacts.length,
    novelThemesAdded: novelThemes.length,
    signalAlreadyInCluster,
  });

  return {
    updatedSummary,
    novelFactsAdded: novelFacts.length,
    novelThemesAdded: novelThemes.length,
    previousSignalCount,
    newSignalCount: finalSignalCount,
  };
}

/**
 * Deduplicate new facts against existing facts using embedding similarity.
 * Uses cached embeddings for existing facts and generates embeddings for new facts.
 */
async function deduplicateFacts(
  newFacts: Array<{ text: string }>,
  existingFacts: Array<{ text: string }>,
  existingEmbeddings: Array<number[]>
): Promise<Array<{ text: string }>> {
  if (existingFacts.length === 0) return newFacts;

  const newEmbeddings = await Promise.all(
    newFacts.map(async (f) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`Embedding timeout for fact: ${f.text.slice(0, 50)}`)), 35000);
        });
        return await Promise.race([
          generateEmbedding(f.text),
          timeoutPromise
        ]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    })
  ).catch(() => []);

  return newFacts.filter((newFact, newIdx) => {
    const newEmbedding = newEmbeddings[newIdx];
    const maxSimilarity = Math.max(
      ...existingEmbeddings.map((existingEmbedding) =>
        cosineSimilarity(newEmbedding, existingEmbedding)
      )
    );
    return maxSimilarity < FACT_DEDUP_SIMILARITY;
  });
}

/**
 * Deduplicate new themes against existing themes using embedding similarity.
 */
async function deduplicateThemes(
  newThemes: Array<{ label: string; evidence: string[] }>,
  existingThemes: Array<{ label: string; evidence: string[] }>
): Promise<Array<{ label: string; evidence: string[] }>> {
  if (existingThemes.length === 0) return newThemes;

  const existingEmbeddings = await Promise.all(
    existingThemes.map((t) => generateEmbedding(t.label))
  );
  const newEmbeddings = await Promise.all(
    newThemes.map((t) => generateEmbedding(t.label))
  );

  return newThemes.filter((_, newIdx) => {
    const newEmbedding = newEmbeddings[newIdx];
    const maxSimilarity = Math.max(
      ...existingEmbeddings.map((existingEmbedding) =>
        cosineSimilarity(newEmbedding, existingEmbedding)
      )
    );
    return maxSimilarity < THEME_DEDUP_SIMILARITY;
  });
}

/**
 * Calculate aggregated confidence across cluster signals.
 * Uses exponential moving average to weight recent signals more heavily.
 */
function calculateAggregatedConfidence(
  previousConfidence: number,
  newConfidence: number,
  signalCount: number
): number {
  if (signalCount <= 1) return newConfidence;
  
  // Exponential moving average with alpha = 2 / (signalCount + 1)
  const alpha = 2 / (signalCount + 1);
  return previousConfidence * (1 - alpha) + newConfidence * alpha;
}
