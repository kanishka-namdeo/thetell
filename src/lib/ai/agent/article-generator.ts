/**
 * Agent-aware article generation.
 * Generates articles with agent-specific voice and optional cross-reference context.
 */

import { logger } from "@/lib/logger";
import { getProvider } from "../provider";
import {
  buildAgentArticleHeadlinePrompt,
  buildAgentArticleSummaryPrompt,
  buildAgentArticleBodyPrompt,
} from "./prompts";
import { z } from "zod";
import type { ProviderName } from "../provider";
import type { AgentConfig, AgentPersona } from "./types";

const HeadlineResultSchema = z.object({
  headline: z.string(),
});

const SummaryResultSchema = z.object({
  summary: z.string(),
});

const BodyResultSchema = z.object({
  body: z.string(),
});

export interface AgentArticleInput {
  companyId: string;
  companyName: string;
  analyses: Array<{
    summary: string;
    keyFacts: Array<{ text: string }>;
    sentiment: string;
    strategicThemes: Array<{ label: string }>;
  }>;
}

export interface AgentArticleResult {
  title: string;
  slug: string;
  summary: string;
  body: string;
}

export interface AgentCrossRef {
  summary: string;
  agentPersona: string;
  keyFacts: string[];
}

/**
 * Generate an article with agent-specific voice.
 *
 * Steps:
 * 1. Generate headline in agent voice
 * 2. Generate executive summary in agent voice
 * 3. Generate article body in agent voice
 * 4. Create URL slug from headline
 */
export async function generateArticleWithAgent(
  input: AgentArticleInput,
  agentConfig: AgentConfig,
  crossRefAnalyses?: AgentCrossRef[],
  providerName: ProviderName = "openai",
  model?: string
): Promise<AgentArticleResult> {
  const startTime = Date.now();
  const log = logger.child({
    companyId: input.companyId,
    persona: agentConfig.persona,
    provider: providerName,
  });

  log.info("agent.article_generation.start", {
    analyses_count: input.analyses.length,
    cross_ref_count: crossRefAnalyses?.length ?? 0,
  });

  try {
    const provider = getProvider(providerName);

    const summaries = input.analyses.map((a) => a.summary);
    const allThemes = input.analyses.flatMap((a) =>
      a.strategicThemes.map((t) => t.label)
    );
    const uniqueThemes = [...new Set(allThemes)];

    const crossRefForPrompts = crossRefAnalyses?.map((a) => ({
      summary: a.summary,
      agentPersona: a.agentPersona,
    }));

    const headlineMessages = buildAgentArticleHeadlinePrompt(
      input.companyName,
      summaries,
      uniqueThemes,
      agentConfig,
      crossRefForPrompts
    );
    const headlineResult = await provider.completeStructured(
      headlineMessages,
      HeadlineResultSchema,
      { model, temperature: agentConfig.temperature }
    );

    log.debug("agent.article_generation.headline_complete", {
      headline: headlineResult.headline,
    });

    const summaryMessages = buildAgentArticleSummaryPrompt(
      input.companyName,
      headlineResult.headline,
      summaries,
      uniqueThemes,
      agentConfig,
      crossRefForPrompts
    );
    const summaryResult = await provider.completeStructured(
      summaryMessages,
      SummaryResultSchema,
      { model, temperature: agentConfig.temperature }
    );

    log.debug("agent.article_generation.summary_complete");

    const analysesForBody = input.analyses.map((a) => ({
      summary: a.summary,
      facts: a.keyFacts.map((f) => f.text),
      sentiment: a.sentiment,
    }));

    const bodyMessages = buildAgentArticleBodyPrompt(
      input.companyName,
      headlineResult.headline,
      summaryResult.summary,
      analysesForBody,
      agentConfig,
      crossRefAnalyses
    );
    const bodyResult = await provider.completeStructured(
      bodyMessages,
      BodyResultSchema,
      { model, temperature: agentConfig.temperature }
    );

    log.debug("agent.article_generation.body_complete");

    const slug = createSlug(headlineResult.headline);
    const latencyMs = Date.now() - startTime;

    log.info("agent.article_generation.complete", {
      latency_ms: latencyMs,
      slug,
    });

    return {
      title: headlineResult.headline,
      slug,
      summary: summaryResult.summary,
      body: bodyResult.body,
    };
  } catch (error) {
    log.error("agent.article_generation.error", { error: String(error) });
    throw error;
  }
}

function createSlug(headline: string): string {
  const timestamp = Date.now();
  const slugified = headline
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 60);

  return `${slugified}-${timestamp}`;
}
