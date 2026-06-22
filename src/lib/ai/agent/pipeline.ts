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
  buildSourceContext,
} from "./prompts";
import { COMMON_FORBIDDEN_PATTERNS } from "./writing-rules";
import { z } from "zod";
import type { ProviderName } from "../provider";
import type { SourceType } from "../types";
import type { AgentConfig, AgentPersona, AgentAnalysis, AgentFact, AgentTheme, AnalystFact, AnalystTheme, AnalystSentiment, GossipFact, GossipTheme, GossipSentiment } from "./types";
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
    // Task 3.5 + 3.6 + 3.8: Run local NLP models in parallel before LLM calls
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

    // Build source context for SOCIAL signals
    const sourceContext = buildSourceContext(
      signal.sourceType,
      signal.metadata,
      signal.engagement,
      agentConfig.persona
    );

    const [factsResult, llmSentimentResult, themesResult] = await Promise.all([
      extractFactsWithPrompt(
        buildAgentFactExtractionPrompt(signal.rawContent, agentConfig, entityContext, sourceContext),
        z.object({ facts: z.array(factSchema) }),
        providerName,
        agentConfig.temperature,
        model
      ),
      // Always run LLM sentiment (needed for Gossip Girl, and fallback for Analyst)
      classifySentimentWithPrompt(
        buildAgentSentimentPrompt(signal.rawContent, agentConfig, entityContext, localSentiment, sourceContext),
        sentimentSchema,
        providerName,
        agentConfig.temperature,
        model
      ),
      identifyThemesWithPrompt(
        buildAgentThemesPrompt(signal.rawContent, agentConfig, entityContext, sourceContext),
        z.object({ themes: z.array(themeSchema) }),
        providerName,
        agentConfig.temperature,
        model
      ),
    ]);

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
    
    // Convert agent-specific facts to generic Fact[] for confidence calculation.
    // NOTE: For GossipFact, `tell_strength` is mapped to `confidence` but these are
    // semantically different — Analyst `confidence` is the fact's reliability score,
    // while Gossip Girl `tell_strength` measures how revealing the tell is. This mapping
    // is a temporary approximation until agent-specific confidence scoring is implemented.
    // TODO(agent-specific-confidence): Replace with persona-aware confidence calculation
    // that treats tell_strength and confidence as distinct signals (Fix 2).
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
        // GossipFact — tell_strength used as proxy for confidence (see note above)
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

    // Task 3.7: Pass NER results to confidence calculation
    const confidence = calculateConfidence({
      sourceType: signal.sourceType,
      contentLength: signal.rawContent.length,
      content: signal.rawContent,
      facts: genericFacts,
      themes: genericThemes,
      llmConfidence,
      agentPersona: agentConfig.persona,
      entities: localEntities,
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

    // Build return value with persona-specific shapes
    if (agentConfig.persona === "ANALYST") {
      const analystFacts = facts as AnalystFact[];
      const analystThemes = themesResult.themes as AnalystTheme[];
      const analystSentiment = sentimentResult as AnalystSentiment;
      
      return {
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
      };
    } else {
      const gossipFacts = facts as GossipFact[];
      const gossipThemes = themesResult.themes as GossipTheme[];
      const gossipSentiment = sentimentResult as GossipSentiment;
      
      return {
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
      };
    }
  } catch (error) {
    log.error("agent.pipeline.error", { error: String(error) });
    throw error;
  }
}
