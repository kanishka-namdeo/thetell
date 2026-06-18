/**
 * Strategic theme identification.
 * Translated from backend/app/analysis/themes.py
 */

import { z } from "zod";
import { logger } from "@/lib/logger";
import { getProvider } from "./provider";
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
  const provider = getProvider(providerName);
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
): Promise<z.infer<T>> {
  const provider = getProvider(providerName);

  logger.debug("analysis.themes.custom.start", {
    provider: providerName,
  });

  const result = await provider.completeStructured(messages, schema, {
    model,
    temperature,
  });

  logger.info("analysis.themes.custom.complete", {
    provider: providerName,
  });

  return result as z.infer<T>;
}
