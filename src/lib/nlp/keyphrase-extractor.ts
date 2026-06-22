/**
 * Key phrase extraction using embedding-based KeyBERT approach.
 *
 * Opportunity 5 from the Local NLP Model Integration Plan.
 * Uses the same embedding model as embedding-generator.ts (shared singleton).
 *
 * Approach: Extract candidate phrases via noun-phrase chunking,
 * rank by cosine similarity to document embedding.
 */

import { generateEmbedding, cosineSimilarity } from "./embedding-generator";
import { logger } from "@/lib/logger";

export interface KeyPhrase {
  phrase: string;
  score: number;
}

/**
 * Extract candidate noun phrases from English text via regex heuristics.
 *
 * Captures common patterns:
 * - Adjective + noun sequences (e.g., "strong revenue growth")
 * - Noun + noun compounds (e.g., "revenue growth", "market share")
 * - Proper noun sequences (e.g., "Apple Inc", "John Smith")
 */
function extractCandidatePhrases(text: string): string[] {
  const candidates = new Set<string>();

  // Clean text: remove extra whitespace
  const cleanText = text.replace(/\s+/g, " ").trim();

  // Pattern 1: Sequences of capitalized words (proper nouns)
  const properNounPattern = /\b([A-Z][a-z]+(?:\s+(?:of|and|the|for|in)\s+)?(?:\s*[A-Z][a-z]+)+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = properNounPattern.exec(cleanText)) !== null) {
    const phrase = match[1].trim();
    if (phrase.length >= 3 && phrase.length <= 60) {
      candidates.add(phrase);
    }
  }

  // Pattern 2: Adjective(s) + noun (common noun phrases)
  const adjNounPattern = /\b((?:\w+ly\s+)?(?:[a-z]+(?:\s*,?\s*)?){0,2}\s*[a-z]+(?:\s+(?:growth|decline|revenue|profit|loss|market|share|debt|equity|earnings|income|sales|demand|supply|cost|price|rate|return|risk|strategy|plan|deal|merger|acquisition|launch|product|service|technology|platform|system|network|channel|segment|region|quarter|year)))\b/gi;
  while ((match = adjNounPattern.exec(cleanText)) !== null) {
    const phrase = match[0].trim();
    if (phrase.length >= 3 && phrase.length <= 60) {
      candidates.add(phrase);
    }
  }

  // Pattern 3: Common financial/corporate 2-3 word phrases
  const corpPhrasePattern = /\b(revenue growth|profit margin|operating income|net income|earnings per share|market cap|share price|dividend yield|cost cutting|debt reduction|capital expenditure|free cash flow|gross margin|operating margin|return on equity|return on assets|year.over.year|quarter.over.quarter|same.store|organic growth|market share|competitive position|strategic initiative|business segment|geographic region|product launch|service expansion|technology platform|digital transformation|supply chain|customer acquisition|user growth|subscription revenue|advertising revenue|licensing revenue|partnership agreement|joint venture|merger acquisition|regulatory approval|intellectual property|research development|operating expense|balance sheet|cash position|guidance outlook|forward looking|analyst consensus|price target|credit rating|bond issuance|stock repurchase|executive compensation|board director|management team|chief executive|chief financial|chief operating|chief technology)\b/gi;
  while ((match = corpPhrasePattern.exec(cleanText)) !== null) {
    candidates.add(match[0].trim());
  }

  // Pattern 4: General 2-3 word noun sequences (adj + noun + noun, etc.)
  const generalNounPattern = /\b([a-zA-Z]{3,}(?:\s+[a-zA-Z]{3,}){1,2})\b/g;
  while ((match = generalNounPattern.exec(cleanText)) !== null) {
    const phrase = match[1].trim();
    // Skip common stopword-only phrases
    const stopwords = new Set(["the", "a", "an", "is", "was", "are", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "shall", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "through", "during", "before", "after", "and", "but", "or", "nor", "not", "so", "yet", "both", "either", "neither", "each", "every", "all", "any", "few", "more", "most", "other", "some", "such", "no", "only", "own", "same", "than", "too", "very", "just", "because", "this", "that", "these", "those", "it", "its"]);
    const words = phrase.toLowerCase().split(/\s+/);
    const meaningful = words.filter(w => !stopwords.has(w));
    if (meaningful.length >= 1 && phrase.length <= 50) {
      candidates.add(phrase);
    }
  }

  return [...candidates];
}

/** Maximum number of candidate phrases to evaluate for keyphrase extraction. */
const MAX_CANDIDATES = 50;

/**
 * Extract the top-K key phrases from text using embedding similarity.
 *
 * Produces more consistent key phrases than LLM extraction
 * (no hallucinated phrases that don't appear in the text).
 * Used for the Analyst persona; Gossip Girl keeps LLM-extracted phrases.
 */
export async function extractKeyPhrases(
  text: string,
  topK: number = 5,
): Promise<KeyPhrase[]> {
  const startTime = Date.now();

  try {
    if (!text || text.trim().length < 10) {
      return [];
    }

    // 1. Generate document embedding
    const docEmbedding = await generateEmbedding(text);

    // 2. Extract candidate phrases (capped to prevent unbounded embedding calls)
    const allCandidates = extractCandidatePhrases(text);
    const candidates = allCandidates.slice(0, MAX_CANDIDATES);

    if (candidates.length === 0) {
      logger.debug("nlp.keyphrase.no_candidates", { textLength: text.length });
      return [];
    }

    if (allCandidates.length > MAX_CANDIDATES) {
      logger.debug("nlp.keyphrase.candidates_capped", {
        totalCandidates: allCandidates.length,
        cappedTo: MAX_CANDIDATES,
      });
    }

    // 3. Generate embedding for each candidate and compute similarity
    const scored: KeyPhrase[] = [];
    const seen = new Set<string>();

    for (const phrase of candidates) {
      const normalizedPhrase = phrase.toLowerCase().trim();
      if (seen.has(normalizedPhrase)) continue;
      seen.add(normalizedPhrase);

      try {
        const phraseEmbedding = await generateEmbedding(phrase);
        const similarity = cosineSimilarity(docEmbedding, phraseEmbedding);

        if (similarity > 0.3) {
          scored.push({ phrase, score: similarity });
        }
      } catch (err) {
        logger.debug("nlp.keyphrase.phrase_embedding_failed", {
          phrase: phrase.slice(0, 50),
          error: String(err),
        });
      }
    }

    // 4. Sort by score descending and return top-K
    scored.sort((a, b) => b.score - a.score);
    const result = scored.slice(0, topK);

    const elapsed = Date.now() - startTime;
    logger.info("nlp.keyphrase.extracted", {
      candidatesCount: candidates.length,
      scoredCount: scored.length,
      returnedCount: result.length,
      elapsedMs: elapsed,
    });

    return result;
  } catch (error) {
    logger.error("nlp.keyphrase.extraction_failed", {
      error: String(error),
      textLength: text.length,
    });
    // Graceful degradation: return empty array rather than throwing
    return [];
  }
}
