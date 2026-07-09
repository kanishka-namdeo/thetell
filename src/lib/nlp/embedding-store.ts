/**
 * Database operations for signal embeddings using pgvector.
 * Provides semantic deduplication and storage for signal embeddings.
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Load embedding for a single signal.
 * Uses raw query since embedding column is pgvector (Unsupported in Prisma).
 */
export async function loadSignalEmbedding(signalId: string): Promise<number[] | null> {
  const result = await prisma.$queryRaw<Array<{ embedding: string | null }>>`
    SELECT embedding::text as embedding FROM "Signal" WHERE id = ${signalId}
  `;
  const raw = result[0]?.embedding;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Load embeddings for multiple signals.
 */
export async function loadSignalEmbeddings(signalIds: string[]): Promise<Map<string, number[]>> {
  if (signalIds.length === 0) return new Map();
  if (signalIds.length > 5000) {
    logger.warn("nlp.embedding.load.too_many", { count: signalIds.length, limit: 5000 });
    signalIds = signalIds.slice(0, 5000);
  }
  const result = await prisma.$queryRaw<Array<{ id: string; embedding: string | null }>>`
    SELECT id, embedding::text as embedding FROM "Signal" WHERE id = ANY(${signalIds}) AND embedding IS NOT NULL
  `;
  const map = new Map<string, number[]>();
  for (const row of result) {
    if (!row.embedding) continue;
    try {
      const parsed = JSON.parse(row.embedding);
      if (Array.isArray(parsed)) map.set(row.id, parsed);
    } catch { /* skip */ }
  }
  return map;
}

/**
 * Store embedding for a signal using pgvector.
 */
export async function storeSignalEmbedding(
  signalId: string,
  embedding: number[]
): Promise<void> {
  const vectorString = `[${embedding.join(",")}]`;
  await prisma.$executeRaw`
    UPDATE "Signal" 
    SET embedding = ${vectorString}::vector
    WHERE id = ${signalId}
  `;
  logger.debug("nlp.embedding.stored", { signalId });
}

/**
 * Check for near-duplicate signals using cosine similarity.
 * Returns the ID of the near-duplicate if found (similarity > 0.92), null otherwise.
 */
export async function findNearDuplicate(
  embedding: number[]
): Promise<string | null> {
  const vectorString = `[${embedding.join(",")}]`;
  const result = await prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
    SELECT id, 1 - (embedding <=> ${vectorString}::vector) as similarity
    FROM "Signal"
    WHERE embedding IS NOT NULL
      AND 1 - (embedding <=> ${vectorString}::vector) > 0.92
    ORDER BY similarity DESC
    LIMIT 1
  `;
  return result[0]?.id ?? null;
}

/**
 * Perform semantic search using pgvector cosine similarity.
 * Returns signals ranked by similarity to the query embedding.
 */
export async function semanticSearch(
  queryEmbedding: number[],
  limit: number = 10
): Promise<Array<{ id: string; title: string; similarity: number }>> {
  const vectorString = `[${queryEmbedding.join(",")}]`;
  const results = await prisma.$queryRaw<
    Array<{ id: string; title: string; similarity: number }>
  >`
    SELECT id, title, 1 - (embedding <=> ${vectorString}::vector) as similarity
    FROM "Signal"
    WHERE embedding IS NOT NULL
      AND status = 'ANALYZED'
    ORDER BY embedding <=> ${vectorString}::vector
    LIMIT ${limit}
  `;
  return results;
}
