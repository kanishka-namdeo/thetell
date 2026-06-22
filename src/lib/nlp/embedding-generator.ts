/**
 * Text embedding generation using all-MiniLM-L6-v2.
 *
 * Opportunity 4 from the Local NLP Model Integration Plan.
 * Produces 384-dimensional embeddings for semantic deduplication and search.
 *
 * Model: Xenova/all-MiniLM-L6-v2
 * Performance: 220 req/s, 14.7ms/1K tokens, 68ms latency
 * Dimensions: 384
 */

import { getModelPipeline } from "./model-cache";
import { logger } from "@/lib/logger";

export const EMBEDDING_DIMENSIONS = 384;

/** Maximum text length (characters) before truncation for embedding. ~512 tokens ≈ ~2000 chars. */
const MAX_EMBEDDING_TEXT_LENGTH = 8000;

/**
 * Generate a 384-dimensional embedding vector for the given text.
 *
 * For texts exceeding 512 tokens, uses mean pooling across chunks.
 * Used for semantic deduplication (cosine similarity > 0.92 = near-duplicate)
 * and semantic search.
 *
 * Texts longer than MAX_EMBEDDING_TEXT_LENGTH are truncated to prevent
 * excessive processing time and potential OOM errors.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const startTime = Date.now();

  if (!text || text.trim().length === 0) {
    throw new Error("Cannot generate embedding for empty text");
  }

  // Guard against extremely long texts that could cause OOM or timeout
  const truncatedText = text.length > MAX_EMBEDDING_TEXT_LENGTH
    ? text.slice(0, MAX_EMBEDDING_TEXT_LENGTH)
    : text;

  if (text.length > MAX_EMBEDDING_TEXT_LENGTH) {
    logger.warn("nlp.embedding.text_truncated", {
      originalLength: text.length,
      truncatedLength: MAX_EMBEDDING_TEXT_LENGTH,
    });
  }

  try {
    const extractor = await getModelPipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    );

    // Run feature extraction — returns a tensor
    const output = await (extractor as (text: string, opts: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>)(truncatedText, { pooling: "mean", normalize: true });

    // Convert tensor to plain number array
    const embedding: number[] = Array.from(output.data as Float32Array);

    const elapsed = Date.now() - startTime;
    logger.debug("nlp.embedding.generated", {
      dimensions: embedding.length,
      elapsedMs: elapsed,
      textLength: text.length,
    });

    return embedding;
  } catch (error) {
    logger.error("nlp.embedding.generation_failed", {
      error: String(error),
      textLength: text.length,
    });
    throw error;
  }
}

/**
 * Compute cosine similarity between two embedding vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`,
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}
