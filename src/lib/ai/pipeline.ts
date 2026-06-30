/**
 * Analysis pipeline orchestrator.
 * Translated from backend/app/analysis/pipeline.py
 */

import { logger } from "@/lib/logger";
import { extractFacts } from "./fact-extraction";
import { classifySentiment } from "./sentiment";
import { identifyThemes } from "./themes";
import { calculateConfidence } from "./confidence";
import { getProviderWithFailover } from "./provider";
import { buildSummaryPrompt } from "./prompts";
import { z } from "zod";
import type { ProviderName } from "./provider";
import type { SourceType, Sentiment } from "./types";

const SummaryResultSchema = z.object({
  summary: z.string(),
});

export interface AnalysisInput {
  id: string;
  sourceUrl: string;
  sourceType: SourceType;
  title: string;
  rawContent: string;
  publishedAt: Date | null;
  scrapedAt: Date;
  companyId: string;
  status: string;
  company?: {
    id: string;
    name: string;
    slug: string;
    ticker: string | null;
  };
}

export interface AnalysisResult {
  id: string;
  signalId: string;
  summary: string;
  keyFacts: Array<{
    text: string;
    category: string;
    confidence: number;
    sourceSentence?: string;
  }>;
  sentiment: Sentiment;
  strategicThemes: Array<{
    label: string;
    evidence: string[];
    correlationHints?: string[];
  }>;
  confidence: number;
  modelUsed: string;
  analyzedAt: Date;
}

/**
 * Run the full analysis pipeline on a signal.
 *
 * Steps:
 * 1. Extract facts from the signal text
 * 2. Classify sentiment
 * 3. Identify strategic themes
 * 4. Generate a summary
 * 5. Calculate composite confidence score
 * 6. Return structured analysis result
 */
export async function analyzeSignal(
  signal: AnalysisInput,
  providerName: ProviderName = "openai",
  model?: string
): Promise<AnalysisResult> {
  const startTime = Date.now();
  const log = logger.child({ signalId: signal.id, provider: providerName });

  log.info("analysis.pipeline.start", {
    sourceType: signal.sourceType,
    contentLength: signal.rawContent.length,
  });

  try {
    // Run fact extraction, sentiment, and themes in parallel
    const [factsResult, sentimentResult, themesResult] = await Promise.all([
      extractFacts(signal.rawContent, providerName, model),
      classifySentiment(signal.rawContent, providerName, model),
      identifyThemes(signal.rawContent, providerName, model),
    ]);

    log.debug("analysis.pipeline.parallel_complete", {
      facts_count: factsResult.facts.length,
      sentiment: sentimentResult.sentiment,
      themes_count: themesResult.themes.length,
    });

    // Generate summary
    const { provider } = getProviderWithFailover(providerName);
    const companyName = signal.company?.name ?? "the company";
    const summaryMessages = buildSummaryPrompt(signal.rawContent, companyName);
    const summaryResult = await provider.completeStructured(
      summaryMessages,
      SummaryResultSchema,
      { model, temperature: 0.4 }
    );

    // Calculate composite confidence
    const modelUsed = model ?? process.env.FAST_MODEL ?? "unknown";
    const confidence = calculateConfidence({
      sourceType: signal.sourceType,
      contentLength: signal.rawContent.length,
      facts: factsResult.facts,
      themes: themesResult.themes,
      llmConfidence: sentimentResult.confidence,
    });

    const latencyMs = Date.now() - startTime;

    log.info("analysis.pipeline.complete", {
      confidence: Math.round(confidence * 1000) / 1000,
      latency_ms: latencyMs,
    });

    return {
      id: crypto.randomUUID(),
      signalId: signal.id,
      summary: summaryResult.summary,
      keyFacts: factsResult.facts.map((f) => ({
        text: f.text,
        category: f.category,
        confidence: f.confidence,
        sourceSentence: f.source_sentence,
      })),
      sentiment: sentimentResult.sentiment,
      strategicThemes: themesResult.themes.map((t) => ({
        label: t.label,
        evidence: t.evidence,
        correlationHints: t.correlation_hints,
      })),
      confidence,
      modelUsed,
      analyzedAt: new Date(),
    };
  } catch (error) {
    log.error("analysis.pipeline.error", { error: String(error) });
    throw error;
  }
}
