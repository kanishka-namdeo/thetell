/**
 * Language detection using FastText.
 *
 * Opportunity 6 from the Local NLP Model Integration Plan.
 * Pre-pipeline filter that detects non-English content before the LLM pipeline.
 *
 * Model: Xenova/fasttext-language-identification
 * Performance: <1ms per text, 170+ languages, 98%+ accuracy
 */

import { getModelPipeline } from "./model-cache";
import { logger } from "@/lib/logger";

export interface LanguageDetectionResult {
  language: string;
  confidence: number;
}

const LANGUAGE_CONFIDENCE_THRESHOLD = 0.9;

/**
 * Detect the language of the given text.
 *
 * If the detected language is not English ("en") with confidence > 0.9,
 * the signal should be flagged as NON_ENGLISH and skip the analysis pipeline.
 */
export async function detectLanguage(
  text: string,
): Promise<LanguageDetectionResult> {
  const startTime = Date.now();

  if (!text || text.trim().length === 0) {
    throw new Error("Cannot detect language of empty text");
  }

  try {
    const classifier = await getModelPipeline(
      "text-classification",
      "Xenova/fasttext-language-identification",
    ) as (text: string) => Promise<Array<{ label: string; score: number }>>;

    const sample = text.length > 2000 ? text.slice(0, 2000) : text;
    const result = await classifier(sample);

    // FastText returns array of {label, score} where label is like "__label__en"
    if (!Array.isArray(result) || result.length === 0) {
      throw new Error("Language detection model returned empty result");
    }
    const topResult = result[0];
    const label = topResult.label as string;
    const confidence = topResult.score as number;

    // Extract language code from label (e.g., "__label__en" -> "en")
    const language = label.replace(/^__label__/, "");

    const elapsed = Date.now() - startTime;
    logger.info("nlp.language.detected", {
      language,
      confidence,
      elapsedMs: elapsed,
    });

    return { language, confidence };
  } catch (error) {
    logger.error("nlp.language.detection.failed", {
      error: String(error),
      textLength: text.length,
    });
    throw error;
  }
}

export { LANGUAGE_CONFIDENCE_THRESHOLD };
