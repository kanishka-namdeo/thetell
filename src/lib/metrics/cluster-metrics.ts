/**
 * Cluster metrics — aggregate statistics about cluster health and activity.
 *
 * Expensive to compute (requires GROUP BY across SignalTheme + Signal),
 * so results are cached in-process for 60 seconds. Dashboard refreshes
 * hit the cache; background jobs invalidate on write.
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  clusterCache,
  clusterMetricsKey,
  CLUSTER_CACHE_TTL,
} from "@/lib/cache/cluster-cache";

export interface ClusterMetrics {
  totalClusters: number;
  byStatus: Record<string, number>;
  avgMomentum: number;
  avgSignalCount: number;
  clustersWithArticles: number;
  topClusters: Array<{
    themeId: string;
    label: string;
    momentum: number;
    signalCount: number;
    status: string;
  }>;
  computedAt: string;
}

export async function getClusterMetrics(
  forceRefresh = false
): Promise<ClusterMetrics> {
  const key = clusterMetricsKey();

  if (!forceRefresh) {
    const cached = clusterCache.get<ClusterMetrics>(key);
    if (cached) return cached;
  }

  try {
    const [
      totalClusters,
      statusCounts,
      momentumAvg,
      signalCounts,
      articlesCount,
      topClusters,
    ] = await Promise.all([
      prisma.signalTheme.count(),
      computeStatusCounts(),
      prisma.signalTheme.aggregate({ _avg: { momentum: true } }),
      computeSignalCounts(),
      prisma.clusterArticle.count({ where: { status: "PUBLISHED" } }),
      prisma.signalTheme.findMany({
        where: { status: { in: ["EMERGING", "ACCELERATING"] } },
        select: {
          id: true,
          label: true,
          momentum: true,
          status: true,
          _count: { select: { clusteredSignals: true } },
        },
        orderBy: { momentum: "desc" },
        take: 10,
      }),
    ]);

    const metrics: ClusterMetrics = {
      totalClusters,
      byStatus: statusCounts,
      avgMomentum: momentumAvg._avg.momentum ?? 0,
      avgSignalCount: signalCounts.avg,
      clustersWithArticles: articlesCount,
      topClusters: topClusters.map((c) => ({
        themeId: c.id,
        label: c.label,
        momentum: c.momentum,
        signalCount: c._count.clusteredSignals,
        status: c.status,
      })),
      computedAt: new Date().toISOString(),
    };

    clusterCache.set(key, metrics, CLUSTER_CACHE_TTL.METRICS);
    return metrics;
  } catch (error) {
    logger.error("cluster_metrics.compute_failed", { error: String(error) });
    throw error;
  }
}

async function computeStatusCounts(): Promise<Record<string, number>> {
  const rows = await prisma.signalTheme.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.status] = row._count._all;
  }
  return result;
}

async function computeSignalCounts(): Promise<{ avg: number }> {
  const themes = await prisma.signalTheme.findMany({
    select: { _count: { select: { clusteredSignals: true } } },
    take: 1000,
  });
  if (themes.length === 0) return { avg: 0 };
  const total = themes.reduce((sum, t) => sum + t._count.clusteredSignals, 0);
  return { avg: total / themes.length };
}

export function invalidateClusterMetrics(): void {
  clusterCache.invalidate(clusterMetricsKey());
}
