/**
 * Fact extraction from signal text.
 * Translated from backend/app/analysis/fact_extraction.py
 */

import { z } from "zod";
import { logger } from "@/lib/logger";
import { getProviderWithFailover } from "./provider";
import { buildFactExtractionPrompt } from "./prompts";
import { FactExtractionResultSchema, type FactExtractionResult } from "./types";
import type { ProviderName } from "./provider";
import type { LLMMessage } from "./types";

export async function extractFacts(
  text: string,
  providerName: ProviderName = "openai",
  model?: string
): Promise<FactExtractionResult> {
  const { provider } = getProviderWithFailover(providerName);
  const messages = buildFactExtractionPrompt(text);

  logger.debug("analysis.fact_extraction.start", {
    provider: providerName,
    text_length: text.length,
  });

  const result = await provider.completeStructured(
    messages,
    FactExtractionResultSchema,
    { model, temperature: 0.3 }
  );

  logger.info("analysis.fact_extraction.complete", {
    provider: providerName,
    facts_count: result.facts.length,
  });

  return result;
}

export async function extractFactsWithPrompt<T extends z.ZodTypeAny>(
  messages: LLMMessage[],
  schema: T,
  providerName: ProviderName = "openai",
  temperature: number = 0.3,
  model?: string
): Promise<z.infer<T>> {
  const { provider } = getProviderWithFailover(providerName);

  logger.debug("analysis.fact_extraction.custom.start", {
    provider: providerName,
  });

  const result = await provider.completeStructured(messages, schema, {
    model,
    temperature,
  });

  logger.info("analysis.fact_extraction.custom.complete", {
    provider: providerName,
  });

  return result as z.infer<T>;
}
