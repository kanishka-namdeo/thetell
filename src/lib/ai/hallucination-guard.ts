/**
 * Hallucination guard - validates that LLM-generated content is grounded in source material.
 *
 * Uses simple string similarity (no extra LLM calls) to verify:
 * 1. Facts have valid source_sentence attribution
 * 2. Article claims are traceable to source analyses
 */

import { logger } from "@/lib/logger";

const log = logger.child({ module: "hallucination-guard" });

/**
 * Configuration for hallucination validation.
 */
export interface HallucinationGuardConfig {
  /** Minimum similarity threshold for source_sentence validation (0.0-1.0) */
  sourceSentenceThreshold: number;
  /** Minimum grounding score for article acceptance (0.0-1.0) */
  groundingThreshold: number;
  /** Whether to log detailed validation results */
  verboseLogging: boolean;
}

export const DEFAULT_CONFIG: HallucinationGuardConfig = {
  sourceSentenceThreshold: 0.6,
  groundingThreshold: 0.8,
  verboseLogging: false,
};

/**
 * Result of validating a single fact's source_sentence.
 */
export interface SourceSentenceValidation {
  isValid: boolean;
  similarity: number;
  matchedText?: string;
}

/**
 * Result of validating article body against source analyses.
 */
export interface ArticleValidationResult {
  groundingScore: number;
  ungroundedClaims: string[];
  isAcceptable: boolean;
}

/**
 * Normalize text for comparison: lowercase, strip punctuation, collapse whitespace.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate Jaccard similarity between two strings (token overlap).
 * Returns 0.0-1.0 where 1.0 means identical token sets.
 */
function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeText(a).split(" ").filter((t) => t.length > 2));
  const tokensB = new Set(normalizeText(b).split(" ").filter((t) => t.length > 2));

  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
}

/**
 * Check if a source_sentence appears in the source text (fuzzy match).
 * Returns the best similarity score and matched text if found.
 */
export function validateSourceSentence(
  sourceSentence: string,
  sourceText: string,
  config: HallucinationGuardConfig = DEFAULT_CONFIG
): SourceSentenceValidation {
  if (!sourceSentence || !sourceText) {
    return { isValid: false, similarity: 0 };
  }

  // Normalize both strings
  const normalizedSentence = normalizeText(sourceSentence);
  const normalizedSource = normalizeText(sourceText);

  // Check for substring match (most reliable)
  if (normalizedSource.includes(normalizedSentence)) {
    return {
      isValid: true,
      similarity: 1.0,
      matchedText: sourceSentence,
    };
  }

  // Split source into sentences and check similarity with each
  const sourceSentences = sourceText
    .split(/[.!?]\s+/)
    .filter((s) => s.trim().length > 10);

  let bestSimilarity = 0;
  let bestMatch: string | undefined;

  for (const sentence of sourceSentences) {
    const similarity = jaccardSimilarity(sourceSentence, sentence);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = sentence;
    }
  }

  const isValid = bestSimilarity >= config.sourceSentenceThreshold;

  if (config.verboseLogging) {
    log.debug("hallucination_guard.source_sentence_check", {
      sourceSentence: sourceSentence.slice(0, 50),
      bestSimilarity,
      isValid,
    });
  }

  return {
    isValid,
    similarity: bestSimilarity,
    matchedText: bestMatch,
  };
}

/**
 * Validate an array of facts against source text.
 * Returns valid facts, invalid facts, and overall grounding score.
 *
 * @param sourceType - Optional signal source type. When "WEB_ARCHIVE", relaxes
 *   source_sentence validation because wayback signals contain metadata, not prose.
 */
export function validateFacts<T extends { text: string; source_sentence: string }>(
  facts: T[],
  sourceText: string,
  config: HallucinationGuardConfig = DEFAULT_CONFIG,
  sourceType?: string
): FactsValidationResult<T> {
  if (!facts || facts.length === 0) {
    return {
      validFacts: [],
      invalidFacts: [],
      groundingScore: 0,
    };
  }

  const validFacts: T[] = [];
  const invalidFacts: Array<T & { reason: string }> = [];

  for (const fact of facts) {
    // For WEB_ARCHIVE signals, relax source_sentence validation.
    // The "source" is metadata (URL paths, page sizes, HTTP status), not prose —
    // facts are inferences about changes, not quotes from articles.
    if (sourceType === "WEB_ARCHIVE") {
      const text = fact.text.toLowerCase();
      const isPlausibleWaybackFact =
        fact.text.includes("/") ||
        text.includes("page") ||
        text.includes("changed") ||
        text.includes("bytes") ||
        text.includes("website") ||
        text.includes("archive") ||
        text.includes("snapshot") ||
        text.includes("url") ||
        text.includes("http") ||
        text.includes("size") ||
        text.includes("content");

      if (isPlausibleWaybackFact) {
        validFacts.push(fact);
        continue;
      }
    }

    const validation = validateSourceSentence(fact.source_sentence, sourceText, config);

    if (validation.isValid) {
      validFacts.push(fact);
    } else {
      invalidFacts.push({
        ...fact,
        reason: `source_sentence similarity ${validation.similarity.toFixed(2)} below threshold ${config.sourceSentenceThreshold}`,
      });
    }
  }

  const groundingScore = validFacts.length / facts.length;

  if (config.verboseLogging || invalidFacts.length > 0) {
    log.info("hallucination_guard.facts_validation", {
      totalFacts: facts.length,
      validFacts: validFacts.length,
      invalidFacts: invalidFacts.length,
      groundingScore,
      threshold: config.sourceSentenceThreshold,
    });
  }

  return {
    validFacts,
    invalidFacts,
    groundingScore,
  };
}

/**
 * Result of validating facts against source text.
 */
export interface FactsValidationResult<T = { text: string; source_sentence: string; [key: string]: unknown }> {
  validFacts: T[];
  invalidFacts: Array<T & { reason: string }>;
  groundingScore: number;
}

/**
 * Extract noun phrases and named entities from text.
 * Simple heuristic extraction without NLP models.
 */
function extractCandidateClaims(text: string): string[] {
  // Extract quoted text (likely claims or important phrases)
  const quotes = text.match(/"([^"]+)"/g) || [];
  const quotedClaims = quotes.map((q) => q.replace(/"/g, "").trim()).filter((q) => q.length > 10);

  // Extract bold text (markdown emphasis, likely key claims)
  const boldMatches = text.match(/\*\*([^*]+)\*\*/g) || [];
  const boldClaims = boldMatches.map((b) => b.replace(/\*\*/g, "").trim()).filter((b) => b.length > 5);

  // Extract capitalized phrases (likely named entities)
  const capitalized = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || [];

  return [...quotedClaims, ...boldClaims, ...capitalized];
}

/**
 * Validate article body against source analyses.
 * Checks that key claims in the article appear in the source material.
 */
export function validateArticleBody(
  articleBody: string,
  sourceAnalyses: Array<{ summary: string; facts: string[] }>,
  config: HallucinationGuardConfig = DEFAULT_CONFIG
): ArticleValidationResult {
  if (!articleBody) {
    return {
      groundingScore: 0,
      ungroundedClaims: [],
      isAcceptable: false,
    };
  }

  // Combine all source material into one reference text
  const sourceText = sourceAnalyses
    .map((a) => `${a.summary}\n${a.facts.join("\n")}`)
    .join("\n\n");

  // Extract candidate claims from article
  const candidateClaims = extractCandidateClaims(articleBody);

  if (candidateClaims.length === 0) {
    // No claims to validate - accept if article is short
    const isShortArticle = articleBody.length < 500;
    return {
      groundingScore: isShortArticle ? 1.0 : 0.5,
      ungroundedClaims: [],
      isAcceptable: isShortArticle,
    };
  }

  const ungroundedClaims: string[] = [];
  let groundedCount = 0;

  for (const claim of candidateClaims) {
    // Check if claim appears in source (substring or high similarity)
    const normalizedClaim = normalizeText(claim);
    const normalizedSource = normalizeText(sourceText);

    const isSubstring = normalizedSource.includes(normalizedClaim);
    const similarity = jaccardSimilarity(claim, sourceText);

    if (isSubstring || similarity >= 0.4) {
      groundedCount++;
    } else {
      ungroundedClaims.push(claim);
    }
  }

  const groundingScore = groundedCount / candidateClaims.length;
  const isAcceptable = groundingScore >= config.groundingThreshold;

  if (config.verboseLogging || !isAcceptable) {
    log.info("hallucination_guard.article_validation", {
      candidateClaims: candidateClaims.length,
      groundedCount,
      ungroundedClaims: ungroundedClaims.length,
      groundingScore,
      threshold: config.groundingThreshold,
      isAcceptable,
    });
  }

  return {
    groundingScore,
    ungroundedClaims,
    isAcceptable,
  };
}

/**
 * Check if content is "thin" (low information density).
 * Used to determine whether to skip article generation.
 */
export function isThinContent(
  text: string,
  thresholds: { minLength: number; minNumbers: number; minEntities: number } = {
    minLength: 200,
    minNumbers: 1,
    minEntities: 1,
  }
): boolean {
  if (text.length < thresholds.minLength) {
    return true;
  }

  // Count numbers (digits sequences)
  const numbers = text.match(/\d+/g) || [];
  if (numbers.length < thresholds.minNumbers) {
    return true;
  }

  // Count named entities (capitalized multi-word phrases)
  const entities = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || [];
  if (entities.length < thresholds.minEntities) {
    return true;
  }

  return false;
}