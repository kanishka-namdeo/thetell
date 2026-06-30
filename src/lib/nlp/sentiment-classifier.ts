/**
 * Local sentiment classification using FinBERT via @huggingface/transformers.
 *
 * Opportunity 1 from the Local NLP Model Integration Plan.
 * Replaces 2 LLM calls per signal for the Analyst persona.
 *
 * Model: Xenova/finbert (ONNX version for Transformers.js)
 * Expected output: { sentiment, confidence, keyPhrases }
 */

import { nlpPool } from "./nlp-pool";
import { logger } from "@/lib/logger";

export interface LocalSentimentResult {
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  confidence: number;
  keyPhrases: string[];
}

/**
 * Classify sentiment of text using a local FinBERT model.
 *
 * Falls back gracefully if the model fails to load or confidence is below threshold.
 * Confidence threshold: 0.7 — below this, the LLM should be used instead.
 *
 * @param text - The text to classify
 * @param sourceType - Optional signal source type. For SOCIAL signals, skips FinBERT
 *                     (trained on financial text) and throws to trigger LLM fallback.
 */
export async function classifySentimentLocal(
  text: string,
  sourceType?: string,
): Promise<LocalSentimentResult> {
  const startTime = Date.now();

  // FinBERT is trained on financial text — not suitable for social media
  if (sourceType === "SOCIAL") {
    logger.info("nlp.sentiment.skip_finbert_for_social", {
      textLength: text.length,
    });
    throw new Error("FinBERT not suitable for SOCIAL signals, use LLM instead");
  }

  try {
    // Use worker pool for inference
    const result = await nlpPool.dispatch<Array<{ label: string; score: number }>>({
      type: "sentiment",
      model: "Xenova/finbert",
      text,
    });

    // FinBERT returns array of {label, score}
    if (!Array.isArray(result) || result.length === 0) {
      throw new Error("Sentiment model returned empty result");
    }
    const topResult = result[0];
    const label = (topResult.label as string).toUpperCase();
    const confidence = topResult.score as number;

    // Map FinBERT labels to our Sentiment enum
    let sentiment: LocalSentimentResult["sentiment"];
    switch (label) {
      case "POSITIVE":
        sentiment = "POSITIVE";
        break;
      case "NEGATIVE":
        sentiment = "NEGATIVE";
        break;
      case "NEUTRAL":
        sentiment = "NEUTRAL";
        break;
      default:
        logger.warn("nlp.sentiment.unknown_label", { label });
        sentiment = "NEUTRAL";
    }

    const elapsed = Date.now() - startTime;
    logger.info("nlp.sentiment.classified", {
      sentiment,
      confidence,
      elapsedMs: elapsed,
    });

    return {
      sentiment,
      confidence,
      keyPhrases: [], // Key phrases extracted separately by keyphrase-extractor
    };
  } catch (error) {
    logger.error("nlp.sentiment.classification.failed", {
      error: String(error),
      textLength: text.length,
    });
    throw error;
  }
}
