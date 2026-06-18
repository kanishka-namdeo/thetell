/**
 * Agent-aware analysis pipeline.
 * Runs the full analysis pipeline with agent-specific prompts and voice.
 */

import { logger } from "@/lib/logger";
import { extractFactsWithPrompt } from "../fact-extraction";
import { classifySentimentWithPrompt } from "../sentiment";
import { identifyThemesWithPrompt } from "../themes";
import { calculateConfidence } from "../confidence";
import { getProvider } from "../provider";
import {
  buildAgentFactExtractionPrompt,
  buildAgentSentimentPrompt,
  buildAgentThemesPrompt,
  buildAgentSummaryPrompt,
} from "./prompts";
import { z } from "zod";
import type { ProviderName } from "../provider";
import type { SourceType } from "../types";
import type { AgentConfig, AgentPersona, AgentAnalysis, AgentFact, AgentTheme } from "./types";
import {
  AgentFactSchema,
  AgentSentimentSchema,
  AgentThemeSchema,
  AgentSummarySchema,
} from "./types";

export interface AgentAnalysisInput {
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

export interface CrossRefAnalysis {
  id: string;
  agentPersona: AgentPersona;
  summary: string;
  keyFacts: Array<{ text: string }>;
  sentiment: string;
  strategicThemes: Array<{ label: string }>;
}

/**
 * Run the full analysis pipeline with an agent's specific voice and prompts.
 *
 * Steps:
 * 1. Extract facts with agent-specific prompt
 * 2. Classify sentiment with agent flavor
 * 3. Identify themes with agent perspective
 * 4. Generate summary in agent voice
 * 5. Calculate composite confidence
 * 6. Build cross-references if other analyses provided
 * 7. Return structured agent analysis
 */
export async function analyzeSignalWithAgent(
  signal: AgentAnalysisInput,
  agentConfig: AgentConfig,
  crossRefAnalyses?: CrossRefAnalysis[],
  providerName: ProviderName = "openai",
  model?: string
): Promise<AgentAnalysis> {
  const startTime = Date.now();
  const log = logger.child({
    signalId: signal.id,
    persona: agentConfig.persona,
    provider: providerName,
  });

  log.info("agent.pipeline.start", {
    sourceType: signal.sourceType,
    contentLength: signal.rawContent.length,
  });

  try {
    const [factsResult, sentimentResult, themesResult] = await Promise.all([
      extractFactsWithPrompt(
        buildAgentFactExtractionPrompt(signal.rawContent, agentConfig),
        z.object({ facts: z.array(AgentFactSchema) }),
        providerName,
        agentConfig.temperature,
        model
      ),
      classifySentimentWithPrompt(
        buildAgentSentimentPrompt(signal.rawContent, agentConfig),
        AgentSentimentSchema,
        providerName,
        agentConfig.temperature,
        model
      ),
      identifyThemesWithPrompt(
        buildAgentThemesPrompt(signal.rawContent, agentConfig),
        z.object({ themes: z.array(AgentThemeSchema) }),
        providerName,
        agentConfig.temperature,
        model
      ),
    ]);

    log.debug("agent.pipeline.parallel_complete", {
      facts_count: factsResult.facts.length,
      sentiment: sentimentResult.sentiment,
      themes_count: themesResult.themes.length,
    });

    const provider = getProvider(providerName);
    const companyName = signal.company?.name ?? "the company";
    const summaryMessages = buildAgentSummaryPrompt(
      signal.rawContent,
      companyName,
      agentConfig
    );
    const summaryResult = await provider.completeStructured(
      summaryMessages,
      AgentSummarySchema,
      { model, temperature: agentConfig.temperature }
    );

    const modelUsed = model ?? (providerName === "openai" ? "gpt-4o" : "claude-3-5-sonnet");
    const confidence = calculateConfidence({
      sourceType: signal.sourceType,
      contentLength: signal.rawContent.length,
      facts: factsResult.facts,
      themes: themesResult.themes,
      llmConfidence: sentimentResult.confidence,
    });

    const crossReferences = crossRefAnalyses?.length
      ? crossRefAnalyses.map((a) => ({
          analysisId: a.id,
          agentPersona: a.agentPersona,
          connection: `Corroborates ${a.strategicThemes.map((t) => t.label).join(", ") || "themes"} with ${agentConfig.persona} perspective`,
        }))
      : null;

    const latencyMs = Date.now() - startTime;

    log.info("agent.pipeline.complete", {
      confidence: Math.round(confidence * 1000) / 1000,
      latency_ms: latencyMs,
    });

    return {
      id: crypto.randomUUID(),
      signalId: signal.id,
      agentPersona: agentConfig.persona,
      summary: summaryResult.summary,
      keyFacts: factsResult.facts.map((f: AgentFact) => ({
        text: f.text,
        category: f.category,
        confidence: f.confidence,
        sourceSentence: f.source_sentence,
      })),
      sentiment: sentimentResult.sentiment,
      strategicThemes: themesResult.themes.map((t: AgentTheme) => ({
        label: t.label,
        evidence: t.evidence,
        correlationHints: t.correlation_hints,
      })),
      confidence,
      crossReferences,
      modelUsed,
      analyzedAt: new Date(),
    };
  } catch (error) {
    log.error("agent.pipeline.error", { error: String(error) });
    throw error;
  }
}
