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
const MODEL_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MODEL_LOAD_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

// Singleton model instance - loads on first use and caches in memory
let lidModel: LanguageIdentificationModel | null = null;
let modelLoadPromise: Promise<LanguageIdentificationModel> | null = null;
let lastAccessTime: number = 0;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;

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

    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`FastText model load timeout after ${MODEL_LOAD_TIMEOUT_MS}ms`)),
        MODEL_LOAD_TIMEOUT_MS,
      );
    });

    try {
      const model = await Promise.race([getLIDModel(), timeoutPromise]);
      clearTimeout(timeoutId!);
      await model.load();
      const elapsed = Date.now() - startTime;

      logger.info("nlp.language.model.loaded", { elapsedMs: elapsed });

      lidModel = model;
      lastAccessTime = Date.now();
      startIdleCheck();
      return model;
    } catch (error) {
      modelLoadPromise = null;
      logger.error("nlp.language.model.load.failed", {
        error: String(error),
      });
      throw error;
    }
  })();

  return modelLoadPromise;
}

function startIdleCheck(): void {
  if (idleCheckInterval) return;
  idleCheckInterval = setInterval(() => {
    if (lidModel && lastAccessTime > 0 && Date.now() - lastAccessTime > MODEL_IDLE_TIMEOUT_MS) {
      logger.info("nlp.language.model.unloaded_idle");
      lidModel = null;
      modelLoadPromise = null;
    }
  }, 5 * 60 * 1000);
  idleCheckInterval.unref?.();
}

/**
 * Unload the language detection model if it has been idle.
 * Called periodically to free WASM memory.
 */
export function unloadLanguageModel(): void {
  if (lidModel && lastAccessTime > 0 && Date.now() - lastAccessTime > MODEL_IDLE_TIMEOUT_MS) {
    lidModel = null;
    modelLoadPromise = null;
    logger.info("nlp.language.model.unloaded");
  }
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
    lastAccessTime = Date.now();

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
