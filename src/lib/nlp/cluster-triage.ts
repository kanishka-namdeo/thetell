/**
 * Cluster triage — pre-analysis routing of signals to existing clusters.
 *
 * Uses pgvector cosine similarity directly against SignalTheme embeddings
 * to find candidate clusters for a new signal, avoiding loading every
 * SignalTheme record into memory.
 *
 * Returns the best matching cluster if similarity exceeds the configured
 * threshold, otherwise returns null so the caller creates a new cluster.
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { cosineSimilarity } from "./embedding-generator";
import {
  clusterCache,
  clusterEmbeddingsKey,
  CLUSTER_CACHE_TTL,
} from "@/lib/cache/cluster-cache";

export interface ClusterTriageCandidate {
  themeId: string;
  label: string;
  similarity: number;
  status: string;
  momentum: number;
}

export interface ClusterTriageResult {
  matched: boolean;
  cluster: ClusterTriageCandidate | null;
  method: "pgvector" | "fallback";
  candidates: number;
}

const DEFAULT_MATCH_THRESHOLD = 0.75;
const DEFAULT_CANDIDATE_LIMIT = 20;

/**
 * Find the best matching cluster for a signal embedding.
 *
 * Uses pgvector's cosine distance operator (`<=>`) for efficient similarity
 * search. Results are filtered by company and active status, and capped
 * to prevent unbounded result sets.
 */
export async function triageSignalToCluster(
  companyId: string,
  embedding: number[],
  options: {
    threshold?: number;
    limit?: number;
    statusFilter?: string[];
  } = {}
): Promise<ClusterTriageResult> {
  const threshold = options.threshold ?? DEFAULT_MATCH_THRESHOLD;
  const limit = options.limit ?? DEFAULT_CANDIDATE_LIMIT;
  const statusFilter = options.statusFilter ?? ["EMERGING", "ACCELERATING", "PEAKED"];

  if (!embedding || embedding.length === 0) {
    return { matched: false, cluster: null, method: "fallback", candidates: 0 };
  }

  const cacheKey = clusterEmbeddingsKey(companyId);
  const cached = clusterCache.get<ClusterTriageCandidate[]>(cacheKey);
  if (cached) {
    const best = pickBest(cached, threshold);
    return {
      matched: best !== null,
      cluster: best,
      method: "fallback",
      candidates: cached.length,
    };
  }

  try {
    const pgvectorResult = await triageWithPgvector(
      companyId,
      embedding,
      threshold,
      limit,
      statusFilter
    );
    if (pgvectorResult) {
      return pgvectorResult;
    }
  } catch (error) {
    logger.warn("cluster_triage.pgvector_failed", {
      companyId,
      error: String(error),
      fallback: "in-memory",
    });
  }

  return triageInMemory(companyId, embedding, threshold, limit, statusFilter);
}

async function triageWithPgvector(
  companyId: string,
  embedding: number[],
  threshold: number,
  limit: number,
  statusFilter: string[]
): Promise<ClusterTriageResult | null> {
  const vectorString = `[${embedding.join(",")}]`;
  
  // Validate status values against ThemeStatus enum to prevent SQL injection
  const VALID_STATUSES = new Set(["EMERGING", "ACCELERATING", "PEAKED", "FADING", "RESOLVED"]);
  const safeStatuses = statusFilter.filter(s => VALID_STATUSES.has(s));
  if (safeStatuses.length === 0) {
    return { matched: false, cluster: null, method: "pgvector", candidates: 0 };
  }
  const statuses = safeStatuses.map((s) => `'${s}'`).join(",");

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      label: string;
      status: string;
      momentum: number;
      similarity: number;
    }>
  >`
    SELECT
      id,
      label,
      status,
      momentum,
      1 - (embedding <=> ${vectorString}::vector) AS similarity
    FROM "SignalTheme"
    WHERE "companyId" = ${companyId}
      AND status IN (${Prisma.raw(statuses)})
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${vectorString}::vector) >= ${threshold}
    ORDER BY embedding <=> ${vectorString}::vector
    LIMIT ${limit}
  `;

  if (rows.length === 0) {
    return { matched: false, cluster: null, method: "pgvector", candidates: 0 };
  }

  const best = rows[0];
  return {
    matched: true,
    cluster: {
      themeId: best.id,
      label: best.label,
      similarity: Number(best.similarity),
      status: best.status,
      momentum: Number(best.momentum),
    },
    method: "pgvector",
    candidates: rows.length,
  };
}

async function triageInMemory(
  companyId: string,
  embedding: number[],
  threshold: number,
  limit: number,
  statusFilter: string[]
): Promise<ClusterTriageResult> {
  const themes = await prisma.signalTheme.findMany({
    where: {
      companyId,
      status: { in: statusFilter as Array<"EMERGING" | "ACCELERATING" | "PEAKED" | "FADING" | "RESOLVED"> },
    },
    select: {
      id: true,
      label: true,
      status: true,
      momentum: true,
      embedding: true,
    },
    take: limit * 5,
  });

  const candidates: ClusterTriageCandidate[] = [];
  for (const theme of themes) {
    const themeEmbedding = parseEmbedding(theme.embedding);
    if (!themeEmbedding) continue;

    const similarity = cosineSimilarity(embedding, themeEmbedding);
    if (similarity >= threshold) {
      candidates.push({
        themeId: theme.id,
        label: theme.label,
        similarity,
        status: theme.status,
        momentum: theme.momentum,
      });
    }
  }

  candidates.sort((a, b) => b.similarity - a.similarity);
  const top = candidates.slice(0, limit);

  clusterCache.set(clusterEmbeddingsKey(companyId), top, CLUSTER_CACHE_TTL.EMBEDDINGS);

  if (top.length === 0) {
    return { matched: false, cluster: null, method: "fallback", candidates: 0 };
  }

  return {
    matched: true,
    cluster: top[0],
    method: "fallback",
    candidates: top.length,
  };
}

function pickBest(
  candidates: ClusterTriageCandidate[],
  threshold: number
): ClusterTriageCandidate | null {
  const valid = candidates.filter((c) => c.similarity >= threshold);
  if (valid.length === 0) return null;
  return valid.reduce((best, c) => (c.similarity > best.similarity ? c : best));
}

function parseEmbedding(raw: unknown): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}
