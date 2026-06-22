/**
 * Cross-signal debate generation.
 * Synthesizes multiple Analyst and Gossip Girl analyses across a theme cluster
 * into a meta-debate: accumulated hard data vs. accumulated subtext.
 */

import { logger } from "@/lib/logger";
import { getProvider } from "../provider";
import { AgentDebateSchema, type AgentDebate, type AgentAnalysis } from "./types";
import { COMMON_WRITING_RULES } from "./writing-rules";
import type { LLMMessage } from "../types";
import type { ProviderName } from "../provider";
import { calculateSignalWeight } from "../confidence";
import type { SourceType } from "../types";

/** Maximum number of analyses per agent to include in cross-signal debate. */
const MAX_ANALYSES_PER_AGENT = 10;

/**
 * Analysis with source metadata for weighted debate ordering.
 */
export interface WeightedAnalysis extends AgentAnalysis {
  sourceType?: SourceType;
  engagement?: Record<string, unknown> | null;
}

/**
 * Build a cross-signal debate prompt that aggregates multiple analyses per agent.
 * Analyses are sorted by source credibility weight (highest first) and formatted
 * with source type and engagement metadata.
 */
function buildCrossSignalDebatePrompt(
  analystAnalyses: Array<{
    summary: string;
    keyFacts: string[];
    themes: string[];
    sourceType?: SourceType;
    weight: number;
    engagement?: Record<string, unknown> | null;
  }>,
  gossipAnalyses: Array<{
    summary: string;
    keyFacts: string[];
    themes: string[];
    sourceType?: SourceType;
    weight: number;
    engagement?: Record<string, unknown> | null;
  }>,
  themeLabel: string,
  companyName: string,
): LLMMessage[] {
  const formatAnalysis = (
    a: {
      summary: string;
      keyFacts: string[];
      themes: string[];
      sourceType?: SourceType;
      weight: number;
      engagement?: Record<string, unknown> | null;
    },
    i: number,
    label: string,
    factsLabel: string,
    themesLabel: string,
  ): string => {
    const facts = a.keyFacts.map((f) => `  - ${f}`).join("\n");
    const themes = a.themes.map((t) => `  - ${t}`).join("\n");
    const source = a.sourceType || "UNKNOWN";
    const weightStr = a.weight.toFixed(2);

    let engagementNote = "";
    if (a.sourceType === "SOCIAL" && a.engagement) {
      const score = typeof a.engagement.score === "number" ? a.engagement.score : 0;
      engagementNote = ` (Engagement: ${score} upvotes, weight=${weightStr})`;
    } else {
      engagementNote = ` (weight=${weightStr})`;
    }

    return `### ${label} Analysis ${i + 1}${engagementNote}\n[${source}] Summary: ${a.summary}\n${factsLabel}:\n${facts || "  (none)"}\n${themesLabel}:\n${themes || "  (none)"}`;
  };

  const analystSections = analystAnalyses
    .map((a, i) => formatAnalysis(a, i, "Analyst", "Key facts", "Strategic themes"))
    .join("\n\n");

  const gossipSections = gossipAnalyses
    .map((g, i) => formatAnalysis(g, i, "Gossip Girl", "Key tells", "Dramatic themes"))
    .join("\n\n");

  return [
    {
      role: "system",
      content: `You are a corporate intelligence moderator facilitating a structured cross-signal debate between two analyst personas. This is NOT a per-signal debate — you are synthesizing the ACCUMULATED evidence across multiple signals for a single theme.

${COMMON_WRITING_RULES}

**Theme**: ${themeLabel}
**Company**: ${companyName}
**Number of Analyst analyses**: ${analystAnalyses.length}
**Number of Gossip Girl analyses**: ${gossipAnalyses.length}

---

${analystSections}

---

${gossipSections}

---

Your task is to synthesize the ACCUMULATED data from all Analyst analyses against the ACCUMULATED subtext from all Gossip Girl analyses into a structured cross-signal debate.

The Analyst synthesizes all hard data across signals — numbers, dates, named sources, verifiable facts.
Gossip Girl synthesizes all the tells and subtext across signals — behavioral patterns, hidden agendas, narrative shifts.

Return a JSON object. Replace ALL placeholder descriptions with your actual analysis. Do NOT copy the example text verbatim.

Required JSON structure:
{
  "analystPosition": {
    "claim": "<YOUR ANALYSIS: 2-3 sentences summarizing the Analyst's position on this theme>",
    "evidence": ["<fact from the data>", "<fact from the data>"],
    "confidence": <0.0 to 1.0>
  },
  "gossipGirlPosition": {
    "claim": "<YOUR ANALYSIS: 2-3 sentences summarizing Gossip Girl's perspective>",
    "evidence": ["<telltale sign>", "<behavioral pattern>"],
    "tellStrength": <0.0 to 1.0>
  },
  "pointsOfAgreement": ["<shared conclusion>", "<another agreement>"],
  "pointsOfContention": [
    {
      "topic": "<disagreement topic>",
      "analystView": "<Analyst's perspective on this specific point>",
      "gossipGirlView": "<Gossip Girl's perspective on this specific point>",
      "evidence": ["<supporting evidence>"]
    }
  ],
  "synthesis": "<YOUR ANALYSIS: 3-5 sentence balanced conclusion>"
}

RULES:
- Every string field must contain substantive analytical content
- analystPosition.claim: Write the Analyst's thesis (not placeholder text)
- gossipGirlPosition.claim: Write Gossip Girl's thesis (not placeholder text)
- pointsOfContention[].analystView: Write the Analyst's view on this point
- pointsOfContention[].gossipGirlView: Write Gossip Girl's view on this point`,
    },
    {
      role: "user",
      content: `Synthesize these ${analystAnalyses.length + gossipAnalyses.length} analyses across the "${themeLabel}" theme for ${companyName} into a structured cross-signal debate.`,
    },
  ];
}

/**
 * Generate a cross-signal debate from multiple Analyst and Gossip Girl analyses.
 *
 * Unlike per-signal debate (which debates two analyses of the SAME signal),
 * this aggregates ALL analyses across a theme cluster and produces a meta-debate
 * about what the accumulated data says vs. what the accumulated subtext says.
 *
 * Analyses are sorted by source credibility weight (highest first) so the LLM
 * sees the most authoritative evidence first. SOCIAL signals include engagement
 * metadata in the prompt.
 *
 * @param analystAnalyses - All Analyst analyses for the theme's signals
 * @param gossipAnalyses - All Gossip Girl analyses for the theme's signals
 * @param themeLabel - The convergent theme label for this cluster
 * @param companyName - Company name for context
 * @param providerName - LLM provider to use (default: "openai")
 * @param model - Optional model override
 * @returns Structured AgentDebate with cross-signal positions
 */
export async function generateCrossSignalDebate(
  analystAnalyses: WeightedAnalysis[],
  gossipAnalyses: WeightedAnalysis[],
  themeLabel: string,
  companyName: string,
  providerName: ProviderName = "openai",
  model?: string,
): Promise<AgentDebate> {
  const log = logger.child({
    function: "generateCrossSignalDebate",
    themeLabel,
    companyName,
    analystCount: analystAnalyses.length,
    gossipCount: gossipAnalyses.length,
  });

  log.info("cross_signal_debate.start");

  if (analystAnalyses.length === 0 && gossipAnalyses.length === 0) {
    throw new Error(
      "generateCrossSignalDebate requires at least one analysis from either agent",
    );
  }

  // Cap analyses to prevent unbounded prompt growth (memory leak / token overflow)
  const cappedAnalystAnalyses = analystAnalyses.slice(0, MAX_ANALYSES_PER_AGENT);
  const cappedGossipAnalyses = gossipAnalyses.slice(0, MAX_ANALYSES_PER_AGENT);

  if (analystAnalyses.length > MAX_ANALYSES_PER_AGENT || gossipAnalyses.length > MAX_ANALYSES_PER_AGENT) {
    log.warn("cross_signal_debate.analyses_capped", {
      originalAnalyst: analystAnalyses.length,
      originalGossip: gossipAnalyses.length,
      cappedAnalyst: cappedAnalystAnalyses.length,
      cappedGossip: cappedGossipAnalyses.length,
      maxPerAgent: MAX_ANALYSES_PER_AGENT,
    });
  }

  try {
    const provider = getProvider(providerName);

    // Sort by source credibility weight (highest first) so the LLM sees
    // the most authoritative evidence first
    const analystSummaries = cappedAnalystAnalyses
      .map((a) => ({
        summary: a.summary,
        keyFacts: a.keyFacts.map((f) => f.text),
        themes: a.strategicThemes.map((t) => t.label),
        sourceType: a.sourceType,
        weight: calculateSignalWeight(a.sourceType ?? "NEWS", a.engagement),
        engagement: a.engagement,
      }))
      .sort((a, b) => b.weight - a.weight);

    const gossipSummaries = cappedGossipAnalyses
      .map((a) => ({
        summary: a.summary,
        keyFacts: a.keyFacts.map((f) => f.text),
        themes: a.strategicThemes.map((t) => t.label),
        sourceType: a.sourceType,
        weight: calculateSignalWeight(a.sourceType ?? "NEWS", a.engagement),
        engagement: a.engagement,
      }))
      .sort((a, b) => b.weight - a.weight);

    const messages = buildCrossSignalDebatePrompt(
      analystSummaries,
      gossipSummaries,
      themeLabel,
      companyName,
    );

    const result = await provider.completeStructured(
      messages,
      AgentDebateSchema,
      { model, temperature: 0.4 },
    );

    // Post-process: if claims are missing or empty, derive from synthesis
    if ((!result.analystPosition.claim || result.analystPosition.claim.trim() === "") && result.synthesis) {
      // Extract analyst perspective from synthesis (first half)
      const sentences = result.synthesis.split(/(?<=[.!?])\s+/);
      const halfPoint = Math.ceil(sentences.length / 2);
      result.analystPosition.claim = sentences.slice(0, halfPoint).join(" ");
      log.info("cross_signal_debate.derived_analyst_claim_from_synthesis");
    }
    if ((!result.gossipGirlPosition.claim || result.gossipGirlPosition.claim.trim() === "") && result.synthesis) {
      // Extract gossip perspective from synthesis (second half)
      const sentences = result.synthesis.split(/(?<=[.!?])\s+/);
      const halfPoint = Math.ceil(sentences.length / 2);
      result.gossipGirlPosition.claim = sentences.slice(halfPoint).join(" ");
      log.info("cross_signal_debate.derived_gossip_claim_from_synthesis");
    }

    // Post-process: if contention views are empty, derive from positions
    for (const contention of result.pointsOfContention) {
      if (!contention.analystView && result.analystPosition.claim) {
        contention.analystView = result.analystPosition.claim;
      }
      if (!contention.gossipGirlView && result.gossipGirlPosition.claim) {
        contention.gossipGirlView = result.gossipGirlPosition.claim;
      }
    }

    log.info("cross_signal_debate.complete", {
      analystConfidence: result.analystPosition.confidence,
      gossipTellStrength: result.gossipGirlPosition.tellStrength,
      agreementCount: result.pointsOfAgreement.length,
      contentionCount: result.pointsOfContention.length,
      analystClaimPopulated: !!result.analystPosition.claim,
      gossipClaimPopulated: !!result.gossipGirlPosition.claim,
    });

    return result;
  } catch (error) {
    log.error("cross_signal_debate.error", { error: String(error) });
    throw error;
  }
}
