/**
 * Sentiment classification for signals.
 * Translated from backend/app/analysis/sentiment.py
 */

import { z } from "zod";
import { logger } from "@/lib/logger";
import { getProviderWithFailover } from "./provider";
import { buildSentimentPrompt } from "./prompts";
import { SentimentResultSchema, type SentimentResult, type LLMMessage } from "./types";
import type { ProviderName } from "./provider";

export async function classifySentiment(
  text: string,
  providerName: ProviderName = "openai",
  model?: string
): Promise<SentimentResult> {
  const { provider } = getProviderWithFailover(providerName);
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
): Promise<{ data: z.infer<T>; usage: { inputTokens: number; outputTokens: number } }> {
  const { provider } = getProviderWithFailover(providerName);

  logger.debug("analysis.sentiment.custom.start", {
    provider: providerName,
  });

  const result = await provider.completeStructuredWithUsage(messages, schema, {
    model,
    temperature,
  });

  logger.info("analysis.sentiment.custom.complete", {
    provider: providerName,
  });

  return { data: result.data as z.infer<T>, usage: result.usage };
}
