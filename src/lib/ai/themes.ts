/**
 * Strategic theme identification.
 * Translated from backend/app/analysis/themes.py
 */

import { z } from "zod";
import { logger } from "@/lib/logger";
import { getProviderWithFailover } from "./provider";
import { buildThemesPrompt } from "./prompts";
import {
  ThemeExtractionResultSchema,
  type ThemeExtractionResult,
  type LLMMessage,
} from "./types";
import type { ProviderName } from "./provider";

export async function identifyThemes(
  text: string,
  providerName: ProviderName = "openai",
  model?: string
): Promise<ThemeExtractionResult> {
  const { provider } = getProviderWithFailover(providerName);
  const messages = buildThemesPrompt(text);

  logger.debug("analysis.themes.start", {
    provider: providerName,
    text_length: text.length,
  });

  const result = await provider.completeStructured(
    messages,
    ThemeExtractionResultSchema,
    { model, temperature: 0.4 }
  );

  logger.info("analysis.themes.complete", {
    provider: providerName,
    themes_count: result.themes.length,
  });

  return result;
}

export async function identifyThemesWithPrompt<T extends z.ZodTypeAny>(
  messages: LLMMessage[],
  schema: T,
  providerName: ProviderName = "openai",
  temperature: number = 0.4,
  model?: string
): Promise<{ data: z.infer<T>; usage: { inputTokens: number; outputTokens: number } }> {
  const { provider } = getProviderWithFailover(providerName);

  logger.debug("analysis.themes.custom.start", {
    provider: providerName,
  });

  const result = await provider.completeStructuredWithUsage(messages, schema, {
    model,
    temperature,
  });

  logger.info("analysis.themes.custom.complete", {
    provider: providerName,
  });

  return { data: result.data as z.infer<T>, usage: result.usage };
}
