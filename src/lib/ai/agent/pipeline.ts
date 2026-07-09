/**
 * Agent-aware analysis pipeline.
 * Runs the full analysis pipeline with agent-specific prompts and voice.
 */

import { logger } from "@/lib/logger";
import { extractFactsWithPrompt } from "../fact-extraction";
import { classifySentimentWithPrompt } from "../sentiment";
import { identifyThemesWithPrompt } from "../themes";
import { calculateConfidenceDetailed } from "../confidence";
import type { ConfidenceDetailedResult } from "../confidence";
import { getProviderWithFailover } from "../provider";
import type { LLMUsage } from "../provider";
import {
  buildAgentFactExtractionPrompt,
  buildAgentSentimentPrompt,
  buildAgentThemesPrompt,
  buildAgentSummaryPrompt,
  buildSourceContext,
} from "./prompts";
import { COMMON_FORBIDDEN_PATTERNS } from "./writing-rules";
import { z } from "zod";
import type { ProviderName } from "../provider";
import type { SourceType } from "../types";
import type { AgentConfig, AgentPersona, AgentAnalysis, AgentFact, AgentTheme, AnalystFact, AnalystTheme, AnalystSentiment, GossipFact, GossipTheme, GossipSentiment } from "./types";
import { isPreferredSourceType } from "./personas";
import {
  AgentSummarySchema,
  AnalystFactSchema,
  AnalystSentimentSchema,
  AnalystThemeSchema,
  GossipFactSchema,
  GossipSentimentSchema,
  GossipThemeSchema,
} from "./types";
import type { Fact, StrategicTheme } from "../types";
import { classifySentimentLocal } from "@/lib/nlp";
import { extractEntities } from "@/lib/nlp";
import { extractKeyPhrases } from "@/lib/nlp";
import { validateFacts, DEFAULT_CONFIG } from "../hallucination-guard";

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
  engagement?: {
    score?: number;
    comments?: number;
    [key: string]: unknown;
  } | null;
  metadata?: {
    platform?: string;
    subreddit?: string;
    [key: string]: unknown;
  } | null;
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
 * Metrics collected during analysis pipeline execution.
 * Used for persistence to AnalysisMetrics table.
 */
export interface PipelineMetrics {
  tokensIn: number;
  tokensOut: number;
  llmCallCount: number;
  totalLatencyMs: number;
  nlpLatencyMs: number;
  llmLatencyMs: number;
  groundingScore: number;
  validFactCount: number;
  invalidFactCount: number;
  confidenceBreakdown: ConfidenceDetailedResult["breakdown"];
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
 * 7. Return structured agent analysis with metrics
 */
export async function analyzeSignalWithAgent(
  signal: AgentAnalysisInput,
  agentConfig: AgentConfig,
  crossRefAnalyses?: CrossRefAnalysis[],
  providerName: ProviderName = "openai",
  model?: string
): Promise<{ analysis: AgentAnalysis; metrics: PipelineMetrics }> {
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

  // Validate rawContent is not empty
  if (!signal.rawContent || signal.rawContent.trim().length === 0) {
    throw new Error("Cannot analyze signal with empty rawContent");
  }

  try {
    // Task 3.5 + 3.6 + 3.8: Run local NLP models in parallel before LLM calls
    const nlpStartTime = Date.now();
    const [localEntities, localSentiment, localKeyPhrases] = await Promise.all([
      // Task 3.6: Extract entities for LLM prompt enhancement
      extractEntities(signal.rawContent, signal.sourceType).catch((err) => {
        log.warn("agent.pipeline.entity_extraction_failed", { error: String(err) });
        return { persons: [], organizations: [], locations: [], dates: [], monetary: [] };
      }),
      // Task 3.5: Local sentiment for Analyst (fallback to LLM if confidence < 0.7)
      classifySentimentLocal(signal.rawContent, signal.sourceType).catch((err) => {
        log.warn("agent.pipeline.local_sentiment_failed", { error: String(err) });
        return null;
      }),
      // Task 3.8: Local key phrases for Analyst
      extractKeyPhrases(signal.rawContent, 5).catch((err) => {
        log.warn("agent.pipeline.keyphrase_extraction_failed", { error: String(err) });
        return [];
      }),
    ]);
    const nlpLatencyMs = Date.now() - nlpStartTime;

    log.debug("agent.pipeline.local_nlp_complete", {
      entities: {
        persons: localEntities.persons.length,
        organizations: localEntities.organizations.length,
        locations: localEntities.locations.length,
        dates: localEntities.dates.length,
        monetary: localEntities.monetary.length,
      },
      localSentiment: localSentiment ? {
        sentiment: localSentiment.sentiment,
        confidence: localSentiment.confidence,
      } : null,
      localKeyPhrases: localKeyPhrases.length,
    });

    // Use persona-specific schemas for type safety
    const factSchema = agentConfig.persona === "ANALYST" 
      ? AnalystFactSchema 
      : GossipFactSchema;
    const sentimentSchema = agentConfig.persona === "ANALYST"
      ? AnalystSentimentSchema
      : GossipSentimentSchema;
    const themeSchema = agentConfig.persona === "ANALYST"
      ? AnalystThemeSchema
      : GossipThemeSchema;

    // Task 3.5: For Analyst, use local sentiment if confidence >= 0.7; otherwise fall back to LLM
    // For Gossip Girl, always use LLM but pass local sentiment as context
    const useLocalSentiment = agentConfig.persona === "ANALYST" &&
      localSentiment && localSentiment.confidence >= 0.7;

    // Task 3.6: Build entity context string for LLM prompts
    const entityContext = [
      ...localEntities.organizations.map(e => `${e} (org)`),
      ...localEntities.persons.map(e => `${e} (person)`),
      ...localEntities.dates.map(e => `${e} (date)`),
      ...localEntities.monetary.map(e => `${e} (amount)`),
    ].join(", ");

    // Build source context for SOCIAL and WEB_ARCHIVE signals
    const sourceContext = buildSourceContext(
      signal.sourceType,
      signal.metadata,
      signal.engagement,
      agentConfig.persona
    );

    // Truncate content to prevent excessive token usage in LLM calls
    const MAX_LLM_CONTENT_LENGTH = 50000;
    const contentForLLM = signal.rawContent.length > MAX_LLM_CONTENT_LENGTH
      ? signal.rawContent.slice(0, MAX_LLM_CONTENT_LENGTH) + "\n\n[Content truncated]"
      : signal.rawContent;

    // Track token usage across all LLM calls in this pipeline
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let llmCallCount = 0;

    const llmStartTime = Date.now();
    const [factsResult, llmSentimentResult, themesResult] = await Promise.all([
      extractFactsWithPrompt(
        buildAgentFactExtractionPrompt(contentForLLM, agentConfig, entityContext, sourceContext, signal.publishedAt),
        z.object({ facts: z.array(factSchema) }),
        providerName,
        agentConfig.temperature,
        model
      ).then(result => {
        totalTokensIn += result.usage.inputTokens;
        totalTokensOut += result.usage.outputTokens;
        llmCallCount++;
        return { facts: result.data.facts };
      }).catch((err) => {
        log.warn("agent.pipeline.fact_extraction_failed", { error: String(err) });
        return { facts: [] };
      }),
      // Always run LLM sentiment (needed for Gossip Girl, and fallback for Analyst)
      classifySentimentWithPrompt(
        buildAgentSentimentPrompt(contentForLLM, agentConfig, entityContext, localSentiment, sourceContext, signal.publishedAt),
        sentimentSchema,
        providerName,
        agentConfig.temperature,
        model
      ).then(result => {
        totalTokensIn += result.usage.inputTokens;
        totalTokensOut += result.usage.outputTokens;
        llmCallCount++;
        return result.data;
      }).catch((err) => {
        log.warn("agent.pipeline.sentiment_classification_failed", { error: String(err) });
        return {
          sentiment: "NEUTRAL" as const,
          confidence: 0.5,
          key_phrases: [] as string[],
          strength: undefined,
          surface_reading: "neutral-surface" as const,
          tell_strength: 0.5,
        };
      }),
      identifyThemesWithPrompt(
        buildAgentThemesPrompt(contentForLLM, agentConfig, entityContext, sourceContext, signal.publishedAt),
        z.object({ themes: z.array(themeSchema) }),
        providerName,
        agentConfig.temperature,
        model
      ).then(result => {
        totalTokensIn += result.usage.inputTokens;
        totalTokensOut += result.usage.outputTokens;
        llmCallCount++;
        return { themes: result.data.themes };
      }).catch((err) => {
        log.warn("agent.pipeline.theme_identification_failed", { error: String(err) });
        return { themes: [] };
      }),
    ]);
    const llmLatencyMs = Date.now() - llmStartTime;

    // Task 3.5: Choose sentiment result based on persona and local confidence
    let sentimentResult: AnalystSentiment | GossipSentiment;
    if (useLocalSentiment && agentConfig.persona === "ANALYST") {
      // Use local sentiment for Analyst when confidence is high
      log.info("agent.pipeline.using_local_sentiment", {
        sentiment: localSentiment!.sentiment,
        confidence: localSentiment!.confidence,
      });
      // Task 3.8: Merge local key phrases into sentiment result for Analyst
      sentimentResult = {
        sentiment: localSentiment!.sentiment,
        confidence: localSentiment!.confidence,
        strength: undefined,
        key_phrases: localKeyPhrases.map(kp => kp.phrase),
      } as AnalystSentiment;
    } else {
      if (agentConfig.persona === "ANALYST" && localSentiment) {
        log.info("agent.pipeline.local_sentiment_low_confidence_fallback", {
          localConfidence: localSentiment.confidence,
          fallback: "LLM",
        });
      }
      sentimentResult = llmSentimentResult;
    }

    log.debug("agent.pipeline.parallel_complete", {
      facts_count: factsResult.facts.length,
      sentiment: agentConfig.persona === "ANALYST" 
        ? (sentimentResult as AnalystSentiment).sentiment
        : (sentimentResult as GossipSentiment).surface_reading,
      themes_count: themesResult.themes.length,
    });

    // Programmatic voice validation - filter facts containing forbidden phrases
    let facts = factsResult.facts;
    const allForbiddenPhrases = [
      ...(agentConfig.forbiddenPhrases || []),
      ...COMMON_FORBIDDEN_PATTERNS,
    ];
    if (allForbiddenPhrases.length > 0) {
      const forbiddenLower = allForbiddenPhrases.map(p => p.toLowerCase());
      const originalCount = facts.length;
      facts = facts.filter(fact => {
        const textLower = fact.text.toLowerCase();
        return !forbiddenLower.some(forbidden => textLower.includes(forbidden));
      });
      if (facts.length < originalCount) {
        log.warn("agent.analysis.filtered_forbidden_phrases", {
          persona: agentConfig.persona,
          original: originalCount,
          filtered: facts.length,
        });
      }
    }

    // Hallucination guard: validate facts have valid source_sentence attribution
    const factsValidation = validateFacts(
      facts,
      signal.rawContent,
      { ...DEFAULT_CONFIG, verboseLogging: true },
      signal.sourceType
    );

    if (factsValidation.invalidFacts.length > 0) {
      log.warn("agent.pipeline.hallucination_guard_rejected_facts", {
        persona: agentConfig.persona,
        rejectedCount: factsValidation.invalidFacts.length,
        groundingScore: factsValidation.groundingScore,
        rejectedReasons: factsValidation.invalidFacts.map((f) => f.reason),
      });
    }

    // Use only validated facts going forward
    facts = factsValidation.validFacts;

    const { provider } = getProviderWithFailover(providerName);
    const companyName = signal.company?.name ?? "the company";
    const summaryMessages = buildAgentSummaryPrompt(
      contentForLLM,
      companyName,
      agentConfig,
      signal.publishedAt
    );
    const summaryResultWithUsage = await provider.completeStructuredWithUsage(
      summaryMessages,
      AgentSummarySchema,
      { model, temperature: agentConfig.temperature }
    );
    const summaryResult = summaryResultWithUsage.data;
    totalTokensIn += summaryResultWithUsage.usage.inputTokens;
    totalTokensOut += summaryResultWithUsage.usage.outputTokens;
    llmCallCount++;

    const modelUsed = model ?? process.env.FAST_MODEL ?? "unknown";
    
    // Convert agent-specific facts to generic Fact[] for confidence calculation.
    // For GossipFact, `tell_strength` is used as a behavioral pattern signal (not confidence).
    // The confidence calculation is persona-aware and treats these differently.
    const genericFacts: Fact[] = facts.map((f: AgentFact) => {
      if ("category" in f) {
        // AnalystFact
        return {
          text: f.text,
          category: f.category,
          confidence: f.confidence,
          source_sentence: f.source_sentence,
        };
      } else {
        // GossipFact — tell_strength contributes to behavioral pattern density score
        return {
          text: f.text,
          category: "strategic" as const,
          confidence: f.tell_strength,
          source_sentence: f.source_sentence,
        };
      }
    });

    // Convert agent-specific themes to generic StrategicTheme[] for confidence calculation
    const genericThemes: StrategicTheme[] = themesResult.themes.map((t: AgentTheme) => {
      if ("correlation_hints" in t) {
        // AnalystTheme
        return {
          label: t.label,
          evidence: t.evidence,
          correlation_hints: t.correlation_hints,
        };
      } else {
        // GossipTheme
        return {
          label: t.label,
          evidence: t.evidence,
          correlation_hints: [],
        };
      }
    });

    // Get confidence value from sentiment (different field names per persona)
    const llmConfidence = agentConfig.persona === "ANALYST"
      ? (sentimentResult as AnalystSentiment).confidence
      : (sentimentResult as GossipSentiment).tell_strength;

    // Hybrid agent routing: boost confidence when agent's sourcePreferences match signal source
    const sourceMatchesPreference = isPreferredSourceType(signal.sourceType, agentConfig);

    log.info("agent.pipeline.preference_match", {
      sourceType: signal.sourceType,
      agentPersona: agentConfig.persona,
      matches: sourceMatchesPreference,
      confidenceBoost: sourceMatchesPreference ? "1.15x" : "none",
    });

    // Task 3.7: Pass NER results to confidence calculation (with detailed breakdown for metrics)
    const confidenceDetailed = calculateConfidenceDetailed({
      sourceType: signal.sourceType,
      contentLength: signal.rawContent.length,
      content: signal.rawContent,
      facts: genericFacts,
      themes: genericThemes,
      llmConfidence,
      agentPersona: agentConfig.persona,
      entities: localEntities,
      sourceMatchesPreference,
      publishedAt: signal.publishedAt,
    });
    const confidence = confidenceDetailed.score;

    const crossReferences = crossRefAnalyses?.length
      ? crossRefAnalyses.map((a) => ({
          analysisId: a.id,
          agentPersona: a.agentPersona,
          connection: `Corroborates ${a.strategicThemes.map((t) => t.label).join(", ") || "themes"} with ${agentConfig.persona} perspective`,
        }))
      : null;

    const totalLatencyMs = Date.now() - startTime;

    log.info("agent.pipeline.complete", {
      confidence: Math.round(confidence * 1000) / 1000,
      latency_ms: totalLatencyMs,
    });

    // Build metrics object for persistence
    const metrics: PipelineMetrics = {
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      llmCallCount,
      totalLatencyMs,
      nlpLatencyMs,
      llmLatencyMs,
      groundingScore: factsValidation.groundingScore,
      validFactCount: factsValidation.validFacts.length,
      invalidFactCount: factsValidation.invalidFacts.length,
      confidenceBreakdown: confidenceDetailed.breakdown,
    };

    // Build return value with persona-specific shapes
    if (agentConfig.persona === "ANALYST") {
      const analystFacts = facts as AnalystFact[];
      const analystThemes = themesResult.themes as AnalystTheme[];
      const analystSentiment = sentimentResult as AnalystSentiment;
      
      return {
        analysis: {
          id: crypto.randomUUID(),
          signalId: signal.id,
          agentPersona: agentConfig.persona,
          summary: summaryResult.summary,
          keyFacts: analystFacts.map((f) => ({
            text: f.text,
            category: f.category,
            confidence: f.confidence,
            source_sentence: f.source_sentence,
          })),
          sentiment: analystSentiment,
          strategicThemes: analystThemes.map((t) => ({
            label: t.label,
            evidence: t.evidence,
            correlation_hints: t.correlation_hints,
          })),
          confidence,
          crossReferences,
          modelUsed,
          analyzedAt: new Date(),
          sourceMatchPreference: sourceMatchesPreference,
        },
        metrics,
      };
    } else {
      const gossipFacts = facts as GossipFact[];
      const gossipThemes = themesResult.themes as GossipTheme[];
      const gossipSentiment = sentimentResult as GossipSentiment;
      
      return {
        analysis: {
          id: crypto.randomUUID(),
          signalId: signal.id,
          agentPersona: agentConfig.persona,
          summary: summaryResult.summary,
          keyFacts: gossipFacts.map((f) => ({
            text: f.text,
            tell_type: f.tell_type,
            tell_strength: f.tell_strength,
            subtext: f.subtext,
            source_sentence: f.source_sentence,
          })),
          sentiment: gossipSentiment,
          strategicThemes: gossipThemes.map((t) => ({
            label: t.label,
            evidence: t.evidence,
            narrative_hook: t.narrative_hook,
          })),
          confidence,
          crossReferences,
          modelUsed,
          analyzedAt: new Date(),
          sourceMatchPreference: sourceMatchesPreference,
        },
        metrics,
      };
    }
  } catch (error) {
    log.error("agent.pipeline.error", { error: String(error) });
    throw error;
  }
}
