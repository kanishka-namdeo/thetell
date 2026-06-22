/**
 * Core types and Zod schemas for the AI analysis layer.
 * Translated from backend/app/models/schemas.py
 */

import { z } from "zod";

// --- Enums ---

export const SourceTypeEnum = z.enum([
  "NEWS",
  "FILING",
  "TRANSCRIPT",
  "SOCIAL",
  "BLOG",
  "JOB_POSTING",
  "RSS",
  "PATENT",
  "LITIGATION",
  "FDA",
  "CONTRACT",
  "TECH_SIGNAL",
  "WEB_ARCHIVE",
  "LEGISLATION",
  "ACADEMIC",
  "PODCAST",
  "CONFERENCE",
  "PRESS_RELEASE",
  "LOBBYING",
]);
export type SourceType = z.infer<typeof SourceTypeEnum>;

export const SentimentEnum = z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]);
export type Sentiment = z.infer<typeof SentimentEnum>;

export const FactCategoryEnum = z.enum([
  "financial",
  "strategic",
  "operational",
  "personnel",
  "market",
]);
export type FactCategory = z.infer<typeof FactCategoryEnum>;

// --- Domain Models ---

export const FactSchema = z.object({
  text: z.string().describe("The fact statement"),
  category: FactCategoryEnum.describe("Category of fact"),
  source_sentence: z
    .string()
    .describe("Original sentence from the signal"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence in this fact"),
});
export type Fact = z.infer<typeof FactSchema>;

export const StrategicThemeSchema = z.object({
  label: z.string().describe("Theme label, e.g., 'expansion', 'M&A'"),
  evidence: z
    .array(z.string())
    .default([])
    .describe("Supporting evidence snippets"),
  correlation_hints: z
    .array(z.string())
    .default([])
    .describe("Hints for cross-signal correlation"),
});
export type StrategicTheme = z.infer<typeof StrategicThemeSchema>;

// --- LLM Message Types ---

export const MessageRoleEnum = z.enum(["system", "user", "assistant"]);
export type MessageRole = z.infer<typeof MessageRoleEnum>;

export const LLMMessageSchema = z.object({
  role: MessageRoleEnum,
  content: z.string(),
});
export type LLMMessage = z.infer<typeof LLMMessageSchema>;

// --- Analysis Result Types ---

export const SentimentResultSchema = z.object({
  sentiment: SentimentEnum.default("NEUTRAL"),
  confidence: z.number().min(0).max(1),
  key_phrases: z.array(z.string()).default([]),
});
export type SentimentResult = z.infer<typeof SentimentResultSchema>;

export const FactExtractionResultSchema = z.object({
  facts: z.array(FactSchema).default([]),
});
export type FactExtractionResult = z.infer<typeof FactExtractionResultSchema>;

export const ThemeExtractionResultSchema = z.object({
  themes: z.array(StrategicThemeSchema).default([]),
});
export type ThemeExtractionResult = z.infer<
  typeof ThemeExtractionResultSchema
>;
