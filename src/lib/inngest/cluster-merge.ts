/**
 * Periodic cluster merge job.
 * Detects and merges duplicate clusters (same company, cosine similarity > 0.85).
 * Runs weekly on Monday at 3 AM UTC.
 */

import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { cosineSimilarity } from "@/lib/nlp/embedding-generator";

const MERGE_SIMILARITY_THRESHOLD = 0.85;
const ACTIVE_STATUSES = ["EMERGING", "ACCELERATING", "PEAKED"] as const;

interface ClusterWithEmbedding {
  id: string;
  label: string;
  companyId: string;
  status: string;
  embedding: number[];
  clusteredSignals: { id: string }[];
  clusterSummary: Prisma.JsonValue;
}

/**
 * Deduplicate facts by normalized text. Returns unique facts.
 */
function deduplicateFacts(
  facts: Array<{ text?: string } | string>,
): Array<{ text?: string } | string> {
  const result: Array<{ text?: string } | string> = [];
  const seen = new Set<string>();

  for (const fact of facts) {
    const text = typeof fact === "string" ? fact : (fact?.text ?? "");
    const normalized = text.toLowerCase().trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(fact);
  }

  return result;
}

/**
 * Deduplicate themes by normalized label. Returns unique themes.
 */
function deduplicateThemes(
  themes: Array<{ label?: string } | string>,
): Array<{ label?: string } | string> {
  const result: Array<{ label?: string } | string> = [];
  const seen = new Set<string>();

  for (const theme of themes) {
    const label = typeof theme === "string" ? theme : (theme?.label ?? "");
    const normalized = label.toLowerCase().trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(theme);
  }

  return result;
}

/**
 * Merge two cluster summaries, deduplicating facts and themes.
 */
function mergeClusterSummaries(
  winnerSummary: Prisma.JsonValue,
  loserSummary: Prisma.JsonValue,
): Prisma.JsonValue {
  const winner = (winnerSummary && typeof winnerSummary === "object" && !Array.isArray(winnerSummary)
    ? winnerSummary as Record<string, unknown>
    : {}) as Record<string, unknown>;
  const loser = (loserSummary && typeof loserSummary === "object" && !Array.isArray(loserSummary)
    ? loserSummary as Record<string, unknown>
    : {}) as Record<string, unknown>;

  const winnerFacts = Array.isArray(winner.keyFacts)
    ? winner.keyFacts as Array<{ text?: string } | string>
    : [];
  const loserFacts = Array.isArray(loser.keyFacts)
    ? loser.keyFacts as Array<{ text?: string } | string>
    : [];
  const mergedFacts = deduplicateFacts([...winnerFacts, ...loserFacts]);

  const winnerThemes = Array.isArray(winner.themes)
    ? winner.themes as Array<{ label?: string } | string>
    : [];
  const loserThemes = Array.isArray(loser.themes)
    ? loser.themes as Array<{ label?: string } | string>
    : [];
  const mergedThemes = deduplicateThemes([...winnerThemes, ...loserThemes]);

  return {
    ...winner,
    keyFacts: mergedFacts,
    themes: mergedThemes,
    mergedAt: new Date().toISOString(),
  } as Prisma.JsonValue;
}

export const mergeClustersFunction = inngest.createFunction(
  {
    id: "merge-clusters",
    concurrency: { limit: 1, key: "merge-clusters" },
    triggers: [
      { cron: "0 3 * * 1" }, // Monday 3 AM UTC
      { event: "cluster-merge/manual.trigger" },
    ],
    retries: 2,
    timeouts: { finish: "30m" },
  },
  async ({ step }) => {
    const log = logger.child({ function: "merge-clusters" });
    log.info("cluster_merge.start");

    // Step 1: Load all active clusters with embeddings
    const clusters = await step.run("load-active-clusters", async () => {
      const activeClusters = await prisma.signalTheme.findMany({
        where: {
          status: { in: [...ACTIVE_STATUSES] },
          embedding: { not: Prisma.JsonNull },
        },
        select: {
          id: true,
          label: true,
          companyId: true,
          status: true,
          embedding: true,
          clusterSummary: true,
          clusteredSignals: {
            select: { id: true },
          },
        },
      });

      log.info("cluster_merge.clusters_loaded", { count: activeClusters.length });

      // Cast: we know embedding is non-null because of the where clause
      return activeClusters as unknown as ClusterWithEmbedding[];
    });

    if (clusters.length < 2) {
      log.info("cluster_merge.too_few_clusters", { count: clusters.length });
      return { success: true, clustersChecked: clusters.length, mergesPerformed: 0, errors: 0 };
    }

    // Step 2: Group by company, compare pairs, and merge duplicates
    // Returns the IDs of winning clusters that need article regeneration
    const mergeResult = await step.run("detect-and-merge", async () => {
      const byCompany = new Map<string, ClusterWithEmbedding[]>();
      for (const cluster of clusters) {
        const existing = byCompany.get(cluster.companyId) ?? [];
        existing.push(cluster);
        byCompany.set(cluster.companyId, existing);
      }

      const winners = new Set<string>();
      let mergeCount = 0;
      let errorCount = 0;

      for (const [companyId, companyClusters] of byCompany) {
        if (companyClusters.length < 2) continue;

        const mergedAway = new Set<string>();

        for (let i = 0; i < companyClusters.length; i++) {
          if (mergedAway.has(companyClusters[i].id)) continue;

          for (let j = i + 1; j < companyClusters.length; j++) {
            if (mergedAway.has(companyClusters[j].id)) continue;

            const clusterA = companyClusters[i];
            const clusterB = companyClusters[j];

            if (!clusterA.embedding || !clusterB.embedding) continue;

            // Skip if both clusters have < 2 signals (not worth merging)
            if (clusterA.clusteredSignals.length < 2 && clusterB.clusteredSignals.length < 2) {
              continue;
            }

            let similarity: number;
            try {
              similarity = cosineSimilarity(clusterA.embedding, clusterB.embedding);
            } catch {
              log.warn("cluster_merge.similarity_error", {
                clusterA: clusterA.id,
                clusterB: clusterB.id,
              });
              continue;
            }

            if (similarity < MERGE_SIMILARITY_THRESHOLD) continue;

            // Winner = cluster with more signals
            const winner = clusterA.clusteredSignals.length >= clusterB.clusteredSignals.length
              ? clusterA
              : clusterB;
            const loser = winner === clusterA ? clusterB : clusterA;

            log.info("cluster_merge.merging", {
              companyId,
              winnerId: winner.id,
              winnerLabel: winner.label,
              winnerSignals: winner.clusteredSignals.length,
              loserId: loser.id,
              loserLabel: loser.label,
              loserSignals: loser.clusteredSignals.length,
              similarity: Math.round(similarity * 1000) / 1000,
            });

            try {
              // Move all signals from loser to winner
              await prisma.signal.updateMany({
                where: { clusterId: loser.id },
                data: { clusterId: winner.id },
              });

              // Merge cluster summaries (deduplicate facts and themes)
              const mergedSummary = mergeClusterSummaries(
                winner.clusterSummary,
                loser.clusterSummary,
              );

              await prisma.signalTheme.update({
                where: { id: winner.id },
                data: { clusterSummary: mergedSummary as Prisma.InputJsonValue },
              });

              // Update in-memory summary so subsequent merges use fresh data
              winner.clusterSummary = mergedSummary;

              // Delete the losing cluster (cascade handles related records)
              await prisma.signalTheme.delete({
                where: { id: loser.id },
              });

              mergeCount++;
              mergedAway.add(loser.id);
              winners.add(winner.id);

              log.info("cluster_merge.merge_complete", {
                winnerId: winner.id,
                loserId: loser.id,
                signalsMoved: loser.clusteredSignals.length,
              });
            } catch (error) {
              errorCount++;
              log.error("cluster_merge.merge_failed", {
                winnerId: winner.id,
                loserId: loser.id,
                error: String(error),
              });
            }
          }
        }
      }

      log.info("cluster_merge.detect_complete", {
        mergesPerformed: mergeCount,
        errors: errorCount,
      });

      return { winnerIds: [...winners], mergesPerformed: mergeCount, errors: errorCount };
    });

    log.info("cluster_merge.complete", {
      clustersChecked: clusters.length,
      mergesPerformed: mergeResult.mergesPerformed,
      errors: mergeResult.errors,
    });

    return {
      success: true,
      clustersChecked: clusters.length,
      mergesPerformed: mergeResult.mergesPerformed,
      errors: mergeResult.errors,
    };
  },
);
