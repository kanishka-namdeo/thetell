/**
 * Lightweight cluster-aware analysis for signals matched to existing clusters.
 *
 * This module provides a cost-effective analysis path for signals that belong to
 * existing clusters. Instead of running full dual-agent analysis (4 LLM calls per agent),
 * it uses cluster context to extract novel information in a single LLM call.
 *
 * Cost: 1 LLM call vs 4 LLM calls per agent (75% reduction)
 */

import { logger } from "@/lib/logger";
import { getProviderWithFailover } from "../provider";
import type { ProviderName } from "../provider";
import type { AgentAnalysisInput } from "./pipeline";
import type { AgentPersona, AnalystFact, GossipFact } from "./types";
import { AnalystFactSchema, GossipFactSchema } from "./types";
import { z } from "zod";
import { classifySentimentLocal, extractEntities, extractKeyPhrases } from "@/lib/nlp";
import { calculateConfidence } from "../confidence";
import { buildClusterFactExtractionPrompt } from "./prompts";

export interface ClusterAnalysisResult {
  keyFacts: AnalystFact[] | GossipFact[];
  sentiment: string;
  strategicThemes: Array<{ label: string; evidence: string[] }>;
  confidence: number;
  summary: string;
  clusterContribution: {
    novelFacts: number;
    novelThemes: number;
    extendsExistingThemes: boolean;
  };
}

export interface ExistingClusterContext {
  label: string;
  summary: unknown;
  signalCount: number;
  existingThemes: string[];
}

const ClusterFactExtractionSchema = z.object({
  facts: z.array(z.union([AnalystFactSchema, GossipFactSchema])),
  themes: z.array(
    z.object({
      label: z.string(),
      evidence: z.array(z.string()),
    })
  ),
  summary: z.string(),
});

/**
 * Analyze a signal in the context of an existing cluster.
 *
 * This function extracts novel information that adds value beyond what's already
 * known in the cluster. It uses a single LLM call with cluster context to identify:
 * - New facts not already covered
 * - Themes that extend or refine existing cluster themes
 * - A summary of the signal's contribution to the cluster
 *
 * @param signal - The signal to analyze
 * @param existingCluster - Context about the existing cluster
 * @param agentPersona - Which agent persona to use (ANALYST or GOSSIP_GIRL)
 * @param providerName - LLM provider to use
 * @param model - Optional specific model to use
 * @returns Lightweight analysis result with cluster contribution metrics
 */
export async function analyzeSignalForCluster(
  signal: AgentAnalysisInput,
  existingCluster: ExistingClusterContext,
  agentPersona: AgentPersona,
  providerName: ProviderName = "openai",
  model?: string
): Promise<ClusterAnalysisResult> {
  const log = logger.child({
    signalId: signal.id,
    clusterLabel: existingCluster.label,
    persona: agentPersona,
    function: "analyzeSignalForCluster",
  });

  const startTime = Date.now();
  log.info("cluster_analysis.start", {
    existingSignalCount: existingCluster.signalCount,
    existingThemeCount: existingCluster.existingThemes.length,
  });

  try {
    // Run local NLP in parallel (no LLM cost)
    const [sentimentResult, entities, keyPhrases] = await Promise.all([
      classifySentimentLocal(signal.rawContent),
      extractEntities(signal.rawContent),
      extractKeyPhrases(signal.rawContent, 10),
    ]);

    // Build entity context for prompt
    const entityContext = [
      ...entities.organizations,
      ...entities.persons,
      ...entities.locations,
    ].join(", ");

    // Extract top 5 existing facts from cluster summary
    const existingFacts = extractExistingFacts(existingCluster.summary);

    // Build cluster-aware prompt
    const messages = buildClusterFactExtractionPrompt(
      signal.rawContent,
      agentPersona,
      {
        label: existingCluster.label,
        existingFacts,
        signalCount: existingCluster.signalCount,
        existingThemes: existingCluster.existingThemes,
      },
      entityContext
    );

    // Single LLM call to extract facts, themes, and summary
    const { provider } = getProviderWithFailover(providerName);
    const llmResult = await provider.completeStructured(
      messages,
      ClusterFactExtractionSchema,
      {
        model,
        temperature: agentPersona === "ANALYST" ? 0.3 : 0.5,
      }
    );

    // Calculate confidence with cluster context bonus
    const baseConfidence = calculateConfidence({
      sourceType: signal.sourceType,
      contentLength: signal.rawContent.length,
      facts: llmResult.facts.map((f: AnalystFact | GossipFact) => {
        // Convert union type to Fact[] - check for tell_type (unique to GossipFact)
        if ('tell_type' in f) {
          // GossipFact: map to Fact format
          return {
            text: f.text,
            category: 'strategic' as const,
            source_sentence: f.source_sentence,
            confidence: f.tell_strength,
          };
        }
        // AnalystFact: already has category and confidence
        const category = f.category ?? 'strategic';
        return {
          text: f.text,
          category,
          source_sentence: f.source_sentence,
          confidence: f.confidence,
        };
      }),
      themes: llmResult.themes.map((t: { label: string; evidence: string[] }) => ({
        label: t.label,
        evidence: t.evidence,
        correlation_hints: [],
      })),
      llmConfidence: 0.75,
      agentPersona,
      entities,
      engagement: signal.engagement ?? undefined,
    });

    // Add cluster context bonus (more signals in cluster = higher confidence)
    const clusterBonus = Math.min(0.1, existingCluster.signalCount * 0.02);
    const confidence = Math.min(1.0, baseConfidence + clusterBonus);

    // Determine sentiment
    const sentiment =
      agentPersona === "ANALYST"
        ? sentimentResult.sentiment.toUpperCase()
        : sentimentResult.sentiment.toLowerCase();

    // Calculate cluster contribution metrics
    const novelFacts = llmResult.facts.length;
    const novelThemes = llmResult.themes.length;
    const extendsExistingThemes = llmResult.themes.some((t: { label: string; evidence: string[] }) =>
      existingCluster.existingThemes.some(
        (existing) =>
          t.label.toLowerCase().includes(existing.toLowerCase()) ||
          existing.toLowerCase().includes(t.label.toLowerCase())
      )
    );

    const result: ClusterAnalysisResult = {
      keyFacts: llmResult.facts as AnalystFact[] | GossipFact[],
      sentiment,
      strategicThemes: llmResult.themes,
      confidence,
      summary: llmResult.summary,
      clusterContribution: {
        novelFacts,
        novelThemes,
        extendsExistingThemes,
      },
    };

    const duration = Date.now() - startTime;
    log.info("cluster_analysis.complete", {
      factCount: novelFacts,
      themeCount: novelThemes,
      confidence,
      duration,
      extendsExistingThemes,
    });

    return result;
  } catch (error) {
    log.error("cluster_analysis.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Extract existing facts from cluster summary for context.
 */
function extractExistingFacts(summary: unknown): string[] {
  if (!summary || typeof summary !== "object") {
    return [];
  }

  const summaryObj = summary as Record<string, unknown>;

  // Try to extract facts from various summary structures
  if (Array.isArray(summaryObj.facts)) {
    return summaryObj.facts
      .filter((f): f is { text: string } => typeof f === "object" && f !== null && "text" in f)
      .map((f) => f.text)
      .slice(0, 5);
  }

  if (Array.isArray(summaryObj.keyThemes)) {
    return summaryObj.keyThemes
      .filter((t): t is string => typeof t === "string")
      .slice(0, 5);
  }

  if (typeof summaryObj.description === "string") {
    // Split description into sentences and take first 5
    return summaryObj.description
      .split(/[.!?]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 5);
  }

  return [];
}
