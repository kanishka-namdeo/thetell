/**
 * In-memory TTL cache for cluster-related data.
 *
 * Purpose:
 * - Avoid recomputing expensive cluster embeddings, summaries, and metrics
 * - Keep hot data in process memory for sub-millisecond reads
 * - Reduce load on Postgres and the embedding model
 *
 * TTLs are chosen to balance freshness with cost:
 * - embeddings: 5 minutes (changes only when signals are added/removed)
 * - summaries: 10 minutes (expensive LLM-generated content)
 * - metrics: 1 minute (high-frequency dashboard reads)
 */

import { logger } from "@/lib/logger";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface ClusterCacheStats {
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  size: number;
}

const DEFAULT_MAX_ENTRIES = 1000;

class ClusterCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private hits = 0;
  private misses = 0;
  private sets = 0;
  private evictions = 0;
  private maxEntries: number;

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      this.misses++;
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      this.misses++;
      this.evictions++;
      return null;
    }
    this.hits++;
    return entry.value;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      this.evictOldest();
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    this.sets++;
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidatePrefix(prefix: string): number {
    let removed = 0;
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  clear(): void {
    this.store.clear();
  }

  stats(): ClusterCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      evictions: this.evictions,
      size: this.store.size,
    };
  }

  private evictOldest(): void {
    const toEvict = Math.max(1, Math.ceil(this.maxEntries * 0.1));
    const entries = Array.from(this.store.entries())
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
      .slice(0, toEvict);

    for (const [key] of entries) {
      this.store.delete(key);
      this.evictions++;
    }
  }
}

export const clusterCache = new ClusterCache();

// TTL constants in milliseconds
export const CLUSTER_CACHE_TTL = {
  EMBEDDINGS: 5 * 60 * 1000,
  SUMMARY: 10 * 60 * 1000,
  METRICS: 60 * 1000,
} as const;

export function clusterEmbeddingsKey(companyId: string): string {
  return `cluster:embeddings:${companyId}`;
}

export function clusterSummaryKey(themeId: string): string {
  return `cluster:summary:${themeId}`;
}

export function clusterMetricsKey(): string {
  return "cluster:metrics";
}

export function invalidateClusterCacheForCompany(companyId: string): void {
  const removed = clusterCache.invalidatePrefix(`cluster:embeddings:${companyId}`);
  logger.debug("cluster_cache.invalidated", { companyId, removed });
}

export function invalidateClusterSummary(themeId: string): void {
  clusterCache.invalidate(clusterSummaryKey(themeId));
}

export function getClusterCacheStats(): ClusterCacheStats {
  return clusterCache.stats();
}
