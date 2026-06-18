/**
 * Sentiment classification for signals.
 * Translated from backend/app/analysis/sentiment.py
 */

import { z } from "zod";
import { logger } from "@/lib/logger";
import { getProvider } from "./provider";
import { buildSentimentPrompt } from "./prompts";
import { SentimentResultSchema, type SentimentResult, type LLMMessage } from "./types";
import type { ProviderName } from "./provider";

export async function classifySentiment(
  text: string,
  providerName: ProviderName = "openai",
  model?: string
): Promise<SentimentResult> {
  const provider = getProvider(providerName);
  const messages = buildSentimentPrompt(text);

  logger.debug("analysis.sentiment.start", {
    provider: providerName,
    text_length: text.length,
  });

  const result = await provider.completeStructured(
    messages,
    SentimentResultSchema,
    { model, temperature: 0.3 }
  );

  logger.info("analysis.sentiment.complete", {
    provider: providerName,
    sentiment: result.sentiment,
    confidence: result.confidence,
  });

  return result;
}

export async function classifySentimentWithPrompt<T extends z.ZodTypeAny>(
  messages: LLMMessage[],
  schema: T,
  providerName: ProviderName = "openai",
  temperature: number = 0.3,
  model?: string
): Promise<z.infer<T>> {
  const provider = getProvider(providerName);

  logger.debug("analysis.sentiment.custom.start", {
    provider: providerName,
  });

  const result = await provider.completeStructured(messages, schema, {
    model,
    temperature,
  });

  logger.info("analysis.sentiment.custom.complete", {
    provider: providerName,
  });

  return result as z.infer<T>;
}
