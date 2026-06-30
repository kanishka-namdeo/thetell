/**
 * Cross-signal debate generation.
 * Synthesizes multiple Analyst and Gossip Girl analyses across a theme cluster
 * into a meta-debate: accumulated hard data vs. accumulated subtext.
 */

import { logger } from "@/lib/logger";
import { getProviderWithFailover } from "../provider";
import { AgentDebateSchema, type AgentDebate, type AgentAnalysis } from "./types";
import { COMMON_WRITING_RULES } from "./writing-rules";
import type { LLMMessage } from "../types";
import type { ProviderName } from "../provider";
import { calculateSignalWeight } from "../confidence";
import type { SourceType } from "../types";

/** Maximum number of analyses per agent to include in cross-signal debate. */
const MAX_ANALYSES_PER_AGENT = 10;

/** Maximum number of facts to include per analysis to prevent O(n²) blowup. */
const MAX_FACTS_PER_ANALYSIS = 100;

/** Maximum prompt size in characters to prevent token overflow. */
const MAX_PROMPT_SIZE = 100_000;

/**
 * Analysis with source metadata for weighted debate ordering.
 */
export interface WeightedAnalysis extends AgentAnalysis {
  sourceType?: SourceType;
  engagement?: Record<string, unknown> | null;
  signalTitle?: string;
  publishedAt?: Date | null;
}

/**
 * Result of cross-signal debate generation with evidence provenance.
 */
export interface CrossSignalDebateResult {
  debate: AgentDebate;
  evidenceProvenance: Record<string, string[]>;
}

/**
 * Build a cross-signal debate prompt that aggregates multiple analyses per agent.
 * Analyses are sorted by source credibility weight (highest first) and formatted
 * with source type, engagement metadata, and signal identifiers for provenance tracking.
 */
function buildCrossSignalDebatePrompt(
  analystAnalyses: Array<{
    summary: string;
    keyFacts: string[];
    themes: string[];
    sourceType?: SourceType;
    weight: number;
    engagement?: Record<string, unknown> | null;
    signalId?: string;
    signalTitle?: string;
    publishedAt?: Date | null;
  }>,
  gossipAnalyses: Array<{
    summary: string;
    keyFacts: string[];
    themes: string[];
    sourceType?: SourceType;
    weight: number;
    engagement?: Record<string, unknown> | null;
    signalId?: string;
    signalTitle?: string;
    publishedAt?: Date | null;
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
      signalId?: string;
      signalTitle?: string;
      publishedAt?: Date | null;
    },
    i: number,
    label: string,
    factsLabel: string,
    themesLabel: string,
  ): string => {
    const facts = a.keyFacts.slice(0, MAX_FACTS_PER_ANALYSIS).map((f) => `  - ${f}`).join("\n");
    const themes = a.themes.map((t) => `  - ${t}`).join("\n");
    const source = a.sourceType || "UNKNOWN";
    const weightStr = a.weight.toFixed(2);
    const signalRef = a.signalId ? ` [Signal: ${a.signalTitle || "Untitled"} (${a.signalId})]` : "";

    let engagementNote = "";
    if (a.sourceType === "SOCIAL" && a.engagement) {
      const score = typeof a.engagement.score === "number" ? a.engagement.score : 0;
      engagementNote = ` (Engagement: ${score} upvotes, weight=${weightStr})`;
    } else {
      engagementNote = ` (weight=${weightStr})`;
    }

    const dateNote = a.publishedAt
      ? ` [Published: ${new Date(a.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}]`
      : "";

    return `### ${label} Analysis ${i + 1}${engagementNote}${signalRef}${dateNote}\n[${source}] Summary: ${a.summary}\n${factsLabel}:\n${facts || "  (none)"}\n${themesLabel}:\n${themes || "  (none)"}`;
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

Note the chronological order of signals (indicated by [Published: ...] dates) — look for narrative shifts, evolving claims, and changing patterns over time. Earlier signals may show initial reactions while later signals may show updated positions or reversals.

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
  "synthesis": "<YOUR ANALYSIS: 3-5 sentence balanced conclusion>",
  "evidenceChain": [
    {
      "claim": "<A specific claim or finding from the debate>",
      "supportingSignals": [
        {
          "signalId": "<Signal ID from the input>",
          "title": "<Signal title>",
          "fact": "<The specific fact from that signal supporting this claim>"
        }
      ],
      "contradictingSignals": [
        {
          "signalId": "<Signal ID>",
          "title": "<Signal title>",
          "fact": "<The specific fact that contradicts or complicates this claim>"
        }
      ]
    }
  ]
}

RULES:
- Every string field must contain substantive analytical content
- analystPosition.claim: Write the Analyst's thesis (not placeholder text)
- gossipGirlPosition.claim: Write Gossip Girl's thesis (not placeholder text)
- pointsOfContention[].analystView: Write the Analyst's view on this point
- pointsOfContention[].gossipGirlView: Write Gossip Girl's view on this point
- evidenceChain: Track which signals support each claim. Use the signal IDs provided in the input (e.g., "[Signal: Title (signalId)]"). For each key claim, list the signals that support it and any that contradict it. This creates an auditable evidence trail.`,
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
 * @returns CrossSignalDebateResult with debate and evidenceProvenance map
 */
export async function generateCrossSignalDebate(
  analystAnalyses: WeightedAnalysis[],
  gossipAnalyses: WeightedAnalysis[],
  themeLabel: string,
  companyName: string,
  providerName: ProviderName = "openai",
  model?: string,
): Promise<CrossSignalDebateResult> {
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
    const { provider } = getProviderWithFailover(providerName);

    // Sort chronologically (oldest first) so the LLM sees narrative evolution over time
    // Signals without publishedAt go to the end
    const sortByDate = (a: { publishedAt?: Date | null }, b: { publishedAt?: Date | null }): number => {
      if (!a.publishedAt && !b.publishedAt) return 0;
      if (!a.publishedAt) return 1;
      if (!b.publishedAt) return -1;
      return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
    };

    const analystSummaries = cappedAnalystAnalyses
      .map((a) => ({
        summary: a.summary,
        keyFacts: a.keyFacts.map((f) => f.text),
        themes: a.strategicThemes.map((t) => t.label),
        sourceType: a.sourceType,
        weight: calculateSignalWeight(a.sourceType ?? "NEWS", a.engagement),
        engagement: a.engagement,
        signalId: a.signalId,
        signalTitle: a.signalTitle,
        publishedAt: a.publishedAt,
      }))
      .sort(sortByDate);

    const gossipSummaries = cappedGossipAnalyses
      .map((a) => ({
        summary: a.summary,
        keyFacts: a.keyFacts.map((f) => f.text),
        themes: a.strategicThemes.map((t) => t.label),
        sourceType: a.sourceType,
        weight: calculateSignalWeight(a.sourceType ?? "NEWS", a.engagement),
        engagement: a.engagement,
        signalId: a.signalId,
        signalTitle: a.signalTitle,
        publishedAt: a.publishedAt,
      }))
      .sort(sortByDate);

    const messages = buildCrossSignalDebatePrompt(
      analystSummaries,
      gossipSummaries,
      themeLabel,
      companyName,
    );

    // Truncate prompt if it exceeds max size to prevent token overflow
    const totalSize = messages.reduce((sum, m) => sum + m.content.length, 0);
    if (totalSize > MAX_PROMPT_SIZE) {
      log.warn("cross_signal_debate.prompt_truncated", {
        originalSize: totalSize,
        maxSize: MAX_PROMPT_SIZE,
      });
      // Truncate the system message (which contains the bulk of the prompt)
      const systemMsg = messages[0];
      const excess = totalSize - MAX_PROMPT_SIZE;
      systemMsg.content = systemMsg.content.slice(0, systemMsg.content.length - excess);
    }

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

    // Build evidence provenance map from evidenceChain
    const evidenceProvenance: Record<string, string[]> = {};
    if (result.evidenceChain && Array.isArray(result.evidenceChain)) {
      for (const chainItem of result.evidenceChain) {
        const claim = chainItem.claim;
        if (!claim) continue;
        
        const signalIds: string[] = [];
        
        // Collect signal IDs from supporting signals
        if (chainItem.supportingSignals && Array.isArray(chainItem.supportingSignals)) {
          for (const sig of chainItem.supportingSignals) {
            if (sig.signalId && !signalIds.includes(sig.signalId)) {
              signalIds.push(sig.signalId);
            }
          }
        }
        
        // Collect signal IDs from contradicting signals
        if (chainItem.contradictingSignals && Array.isArray(chainItem.contradictingSignals)) {
          for (const sig of chainItem.contradictingSignals) {
            if (sig.signalId && !signalIds.includes(sig.signalId)) {
              signalIds.push(sig.signalId);
            }
          }
        }
        
        if (signalIds.length > 0) {
          evidenceProvenance[claim] = signalIds;
        }
      }
    }

    log.info("cross_signal_debate.complete", {
      analystConfidence: result.analystPosition.confidence,
      gossipTellStrength: result.gossipGirlPosition.tellStrength,
      agreementCount: result.pointsOfAgreement.length,
      contentionCount: result.pointsOfContention.length,
      analystClaimPopulated: !!result.analystPosition.claim,
      gossipClaimPopulated: !!result.gossipGirlPosition.claim,
      evidenceChainLength: result.evidenceChain?.length ?? 0,
      evidenceProvenanceEntries: Object.keys(evidenceProvenance).length,
    });

    return { debate: result, evidenceProvenance };
  } catch (error) {
    log.error("cross_signal_debate.error", { error: String(error) });
    throw error;
  }
}
