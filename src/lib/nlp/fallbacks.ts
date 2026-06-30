/**
 * Graceful degradation wrappers for NLP functions.
 *
 * Each NLP capability has a feature flag that can disable it at runtime.
 * When disabled, the wrapper returns a safe default/fallback value
 * instead of calling the local model.
 *
 * Feature flags (environment variables, default: all enabled):
 * - NLP_LOCAL_SENTIMENT
 * - NLP_QUALITY_GATE
 * - NLP_NER
 * - NLP_EMBEDDINGS
 * - NLP_KEYPHRASES
 * - NLP_LANGUAGE_DETECT
 */

import { logger } from "@/lib/logger";
import { classifySentimentLocal, type LocalSentimentResult } from "./sentiment-classifier";
import { assessContentQuality, type QualityAssessment } from "./quality-gate";
import { extractEntities, type ExtractedEntities } from "./entity-extractor";
import { generateEmbedding } from "./embedding-generator";
import { extractKeyPhrases, type KeyPhrase } from "./keyphrase-extractor";
import { detectLanguage, type LanguageDetectionResult } from "./language-detector";

function isFlagEnabled(envVar: string, defaultValue: boolean = true): boolean {
  const value = process.env[envVar];
  if (value === undefined || value === "") return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

// ---------------------------------------------------------------------------
// Feature flag readers (exported for monitoring / admin endpoints)
// ---------------------------------------------------------------------------

export function getNlpFeatureFlags() {
  return {
    sentiment: isFlagEnabled("NLP_LOCAL_SENTIMENT"),
    qualityGate: isFlagEnabled("NLP_QUALITY_GATE"),
    ner: isFlagEnabled("NLP_NER"),
    embeddings: isFlagEnabled("NLP_EMBEDDINGS"),
    keyphrases: isFlagEnabled("NLP_KEYPHRASES"),
    languageDetect: isFlagEnabled("NLP_LANGUAGE_DETECT"),
    device: process.env.NLP_DEVICE ?? "auto",
  };
}

// ---------------------------------------------------------------------------
// Wrapper: sentiment classification
// ---------------------------------------------------------------------------

export async function classifySentimentWithFallback(
  text: string,
  sourceType?: string,
): Promise<LocalSentimentResult> {
  if (!isFlagEnabled("NLP_LOCAL_SENTIMENT")) {
    logger.debug("nlp.fallback.sentiment", { reason: "flag_disabled" });
    return { sentiment: "NEUTRAL", confidence: 0, keyPhrases: [] };
  }

  try {
    return await classifySentimentLocal(text, sourceType);
  } catch (error) {
    logger.warn("nlp.fallback.sentiment", {
      reason: "model_error",
      sourceType: sourceType ?? "unspecified",
      error: String(error),
    });
    return { sentiment: "NEUTRAL", confidence: 0, keyPhrases: [] };
  }
}

// ---------------------------------------------------------------------------
// Wrapper: content quality gate
// ---------------------------------------------------------------------------

export async function assessQualityWithFallback(
  text: string,
  companyName: string,
): Promise<QualityAssessment> {
  if (!isFlagEnabled("NLP_QUALITY_GATE")) {
    logger.debug("nlp.fallback.quality", { reason: "flag_disabled" });
    return { score: 0.5, pass: true, reasons: ["Quality gate disabled by flag"] };
  }

  try {
    return await assessContentQuality(text, companyName);
  } catch (error) {
    logger.warn("nlp.fallback.quality", {
      reason: "model_error",
      error: String(error),
    });
    return { score: 0.5, pass: true, reasons: ["Quality assessment failed, defaulting to pass"] };
  }
}

// ---------------------------------------------------------------------------
// Wrapper: named entity recognition
// ---------------------------------------------------------------------------

const EMPTY_ENTITIES: ExtractedEntities = {
  persons: [],
  organizations: [],
  locations: [],
  dates: [],
  monetary: [],
};

export async function extractEntitiesWithFallback(
  text: string,
  sourceType?: string,
): Promise<ExtractedEntities> {
  if (!isFlagEnabled("NLP_NER")) {
    logger.debug("nlp.fallback.ner", { reason: "flag_disabled" });
    return { ...EMPTY_ENTITIES };
  }

  try {
    return await extractEntities(text, sourceType);
  } catch (error) {
    logger.warn("nlp.fallback.ner", {
      reason: "model_error",
      sourceType: sourceType ?? "unspecified",
      error: String(error),
    });
    return { ...EMPTY_ENTITIES };
  }
}

// ---------------------------------------------------------------------------
// Wrapper: embedding generation
// ---------------------------------------------------------------------------

export async function generateEmbeddingWithFallback(
  text: string,
): Promise<number[] | null> {
  if (!isFlagEnabled("NLP_EMBEDDINGS")) {
    logger.debug("nlp.fallback.embeddings", { reason: "flag_disabled" });
    return null;
  }

  try {
    return await generateEmbedding(text);
  } catch (error) {
    logger.warn("nlp.fallback.embeddings", {
      reason: "model_error",
      error: String(error),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Wrapper: key phrase extraction
// ---------------------------------------------------------------------------

export async function extractKeyPhrasesWithFallback(
  text: string,
  topK?: number,
): Promise<KeyPhrase[]> {
  if (!isFlagEnabled("NLP_KEYPHRASES")) {
    logger.debug("nlp.fallback.keyphrases", { reason: "flag_disabled" });
    return [];
  }

  try {
    return await extractKeyPhrases(text, topK);
  } catch (error) {
    logger.warn("nlp.fallback.keyphrases", {
      reason: "model_error",
      error: String(error),
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Wrapper: language detection
// ---------------------------------------------------------------------------

export async function detectLanguageWithFallback(
  text: string,
): Promise<LanguageDetectionResult> {
  if (!isFlagEnabled("NLP_LANGUAGE_DETECT")) {
    logger.debug("nlp.fallback.language", { reason: "flag_disabled" });
    return { language: "en", confidence: 1.0 };
  }

  try {
    return await detectLanguage(text);
  } catch (error) {
    logger.warn("nlp.fallback.language", {
      reason: "model_error",
      error: String(error),
    });
    return { language: "en", confidence: 0.5 };
  }
}
