/**
 * Structured debate generation between Analyst and Gossip Girl agents.
 * Synthesizes both perspectives into agreement, contention, and synthesis.
 */

import { logger } from "@/lib/logger";
import { getProviderWithFailover } from "../provider";
import { buildDebatePrompt } from "./prompts";
import { AgentDebateSchema, type AgentDebate } from "./types";
import type { AgentAnalysis } from "./types";
import type { ProviderName } from "../provider";

/**
 * Generate a structured debate between Analyst and Gossip Girl analyses.
 *
 * Takes both agent analyses, builds a debate prompt, and returns a structured
 * debate with positions, agreement points, contention points, and synthesis.
 *
 * @param analystAnalysis - The Analyst's analysis result
 * @param gossipGirlAnalysis - The Gossip Girl's analysis result
 * @param providerName - LLM provider to use (default: "openai")
 * @param model - Optional model override
 * @returns Structured debate with positions, agreement, contention, and synthesis
 */
export async function generateDebate(
  analystAnalysis: AgentAnalysis,
  gossipGirlAnalysis: AgentAnalysis,
  providerName: ProviderName = "openai",
  model?: string
): Promise<AgentDebate> {
  const log = logger.child({
    signalId: analystAnalysis.signalId,
    function: "generateDebate",
  });

  log.info("debate.generation.start");

  const { provider } = getProviderWithFailover(providerName);

  // Prepare analysis summaries for the debate prompt
  const analystSummary = {
    summary: analystAnalysis.summary,
    keyFacts: analystAnalysis.keyFacts.map((f) => f.text),
    strategicThemes: analystAnalysis.strategicThemes.map((t) => t.label),
  };

  const gossipSummary = {
    summary: gossipGirlAnalysis.summary,
    keyFacts: gossipGirlAnalysis.keyFacts.map((f) => f.text),
    strategicThemes: gossipGirlAnalysis.strategicThemes.map((t) => t.label),
  };

  const messages = buildDebatePrompt(analystSummary, gossipSummary);

  try {
    const result = await provider.completeStructured(
      messages,
      AgentDebateSchema,
      { model, temperature: 0.5 }
    );

    log.info("debate.generation.complete", {
      analystConfidence: result.analystPosition.confidence,
      gossipTellStrength: result.gossipGirlPosition.tellStrength,
      agreementCount: result.pointsOfAgreement.length,
      contentionCount: result.pointsOfContention.length,
    });

    return result;
  } catch (error) {
    log.error("debate.generation.error", { error: String(error) });
    throw error;
  }
}
