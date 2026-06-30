/**
 * Language detection using FastText WASM.
 *
 * Opportunity 6 from the Local NLP Model Integration Plan.
 * Pre-pipeline filter that detects non-English content before the LLM pipeline.
 *
 * Model: FastText LID-176 (loaded via fasttext.wasm.js)
 * Performance: 176 languages supported, 98% accuracy, <100ms inference
 */

import { getLIDModel } from "fasttext.wasm.js";

type LanguageIdentificationModel = Awaited<ReturnType<typeof getLIDModel>>;
import { logger } from "@/lib/logger";

export interface LanguageDetectionResult {
  language: string;
  confidence: number;
}

const LANGUAGE_CONFIDENCE_THRESHOLD = 0.9;

// Singleton model instance - loads on first use and caches in memory
let lidModel: LanguageIdentificationModel | null = null;
let modelLoadPromise: Promise<LanguageIdentificationModel> | null = null;

/**
 * Get or initialize the FastText LID model.
 * Uses singleton pattern to ensure model is loaded only once.
 */
async function getModel(): Promise<LanguageIdentificationModel> {
  if (lidModel) {
    return lidModel;
  }

  // Prevent concurrent initialization
  if (modelLoadPromise) {
    return modelLoadPromise;
  }

  modelLoadPromise = (async () => {
    const startTime = Date.now();
    logger.debug("nlp.language.model.loading");

    try {
      const model = await getLIDModel();
      await model.load();
      const elapsed = Date.now() - startTime;

      logger.info("nlp.language.model.loaded", { elapsedMs: elapsed });

      lidModel = model;
      return model;
    } catch (error) {
      // Reset so next call retries
      modelLoadPromise = null;
      logger.error("nlp.language.model.load.failed", {
        error: String(error),
      });
      throw error;
    }
  })();

  return modelLoadPromise;
}

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
    const model = await getModel();

    // FastText works best with text truncated to ~1000 chars for language detection
    // Replace newlines with spaces (FastText expects single-line input)
    const cleanedText = text.replace(/\s+/g, " ").trim();
    const sample = cleanedText.length > 1000 ? cleanedText.slice(0, 1000) : cleanedText;

    // Get top 3 predictions to calculate normalized confidence
    // predict returns Vector<Pair<number, string>> = Vector<[probability, "__label__xx"]>
    const predictions = model.model!.predict(sample, 3);

    try {
      if (predictions.size() === 0) {
        throw new Error("Language detection model returned empty result");
      }

      const [topScore, topLabel] = predictions.get(0);
      const language = topLabel.replace(/^__label__/, "");

      // Normalize confidence: if top prediction is much higher than others,
      // we're more confident. Calculate ratio of top score to sum of top 3.
      let normalizedConfidence = topScore;
      if (predictions.size() > 1) {
        let sum = 0;
        for (let i = 0; i < predictions.size(); i++) {
          sum += predictions.get(i)[0];
        }
        normalizedConfidence = topScore / sum;
      }

      const elapsed = Date.now() - startTime;
      logger.info("nlp.language.detected", {
        language,
        confidence: normalizedConfidence,
        rawScore: topScore,
        elapsedMs: elapsed,
      });

      return { language, confidence: normalizedConfidence };
    } finally {
      predictions.delete();
    }
  } catch (error) {
    logger.error("nlp.language.detection.failed", {
      error: String(error),
      textLength: text.length,
    });
    throw error;
  }
}

export { LANGUAGE_CONFIDENCE_THRESHOLD };
