/**
 * Cluster performance metrics — latency tracking for cluster pipeline stages.
 *
 * Maintains a ring buffer of recent observations per metric and exposes
 * p50 / p95 / p99 percentiles. Used to surface regressions in triage,
 * analysis, article generation, and cache effectiveness.
 *
 * All data lives in process memory; this is a diagnostic tool, not a
 * persistent time series.
 */

import { logger } from "@/lib/logger";

const RING_BUFFER_SIZE = 500;

export type ClusterStage =
  | "triage"
  | "cluster_analysis"
  | "cluster_update"
  | "cluster_article_generation"
  | "evidence_chain_query";

interface Observation {
  value: number;
  timestamp: number;
}

interface StageStats {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  count: number;
  mean: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

class PerformanceTracker {
  private buffers = new Map<ClusterStage, Observation[]>();
  private cacheHits = new Map<string, number>();
  private cacheMisses = new Map<string, number>();

  record(stage: ClusterStage, durationMs: number): void {
    const buf = this.buffers.get(stage) ?? [];
    buf.push({ value: durationMs, timestamp: Date.now() });
    if (buf.length > RING_BUFFER_SIZE) {
      buf.shift();
    }
    this.buffers.set(stage, buf);
  }

  recordCacheHit(cacheName: string): void {
    this.cacheHits.set(cacheName, (this.cacheHits.get(cacheName) ?? 0) + 1);
  }

  recordCacheMiss(cacheName: string): void {
    this.cacheMisses.set(
      cacheName,
      (this.cacheMisses.get(cacheName) ?? 0) + 1
    );
  }

  getStats(stage: ClusterStage): StageStats | null {
    const buf = this.buffers.get(stage);
    if (!buf || buf.length === 0) return null;
    return computeStats(buf);
  }

  getCacheStats(cacheName: string): CacheStats {
    const hits = this.cacheHits.get(cacheName) ?? 0;
    const misses = this.cacheMisses.get(cacheName) ?? 0;
    const total = hits + misses;
    return {
      hits,
      misses,
      hitRate: total === 0 ? 0 : hits / total,
    };
  }

  getAllStats(): Record<ClusterStage, StageStats | null> {
    const stages: ClusterStage[] = [
      "triage",
      "cluster_analysis",
      "cluster_update",
      "cluster_article_generation",
      "evidence_chain_query",
    ];
    const result: Record<string, StageStats | null> = {};
    for (const stage of stages) {
      result[stage] = this.getStats(stage);
    }
    return result as Record<ClusterStage, StageStats | null>;
  }

  reset(): void {
    this.buffers.clear();
    this.cacheHits.clear();
    this.cacheMisses.clear();
  }

  snapshot(): string {
    const all = this.getAllStats();
    return JSON.stringify({ stages: all, caches: this.allCacheStats() });
  }

  private allCacheStats(): Record<string, CacheStats> {
    const names = new Set<string>([
      ...this.cacheHits.keys(),
      ...this.cacheMisses.keys(),
    ]);
    const result: Record<string, CacheStats> = {};
    for (const name of names) {
      result[name] = this.getCacheStats(name);
    }
    return result;
  }
}

function computeStats(buf: Observation[]): StageStats {
  const values = buf.map((o) => o.value).sort((a, b) => a - b);
  const count = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    min: values[0],
    max: values[count - 1],
    count,
    mean: sum / count,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export const clusterPerformanceMetrics = new PerformanceTracker();

/**
 * Time an async operation and record it against a stage.
 * Returns the operation's result so callers can wrap arbitrary calls.
 */
export async function timed<T>(
  stage: ClusterStage,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    clusterPerformanceMetrics.record(stage, Date.now() - start);
    return result;
  } catch (error) {
    clusterPerformanceMetrics.record(stage, Date.now() - start);
    logger.error("cluster_perf.timed_error", {
      stage,
      durationMs: Date.now() - start,
      error: String(error),
    });
    throw error;
  }
}

/**
 * Wrap a cache lookup with hit/miss tracking.
 */
export function trackedCacheLookup<T>(
  cacheName: string,
  value: T | null
): T | null {
  if (value !== null) {
    clusterPerformanceMetrics.recordCacheHit(cacheName);
  } else {
    clusterPerformanceMetrics.recordCacheMiss(cacheName);
  }
  return value;
}
