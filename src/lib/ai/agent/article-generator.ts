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
  agentPersona?: AgentPersona;
  sourceType?: string;
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
 * Build social signal context string for article generation prompts.
 * Returns an empty string when the signal is not social or has no engagement data.
 */
export function buildSocialContext(
  sourceType: string | undefined,
  engagement: AgentArticleInput["engagement"],
  metadata: AgentArticleInput["metadata"]
): string {
  if (sourceType !== "SOCIAL" || !engagement) {
    return "";
  }

  const parts: string[] = [];

  if (metadata?.subreddit) {
    parts.push(`a reddit post from r/${metadata.subreddit}`);
  } else if (metadata?.platform) {
    parts.push(`a post on ${metadata.platform}`);
  } else {
    parts.push("a social media post");
  }

  const metrics: string[] = [];
  if (typeof engagement.score === "number") {
    metrics.push(`${engagement.score.toLocaleString()} upvotes`);
  }
  if (typeof engagement.comments === "number") {
    metrics.push(`${engagement.comments.toLocaleString()} comments`);
  }

  if (metrics.length > 0) {
    parts.push(`with ${metrics.join(" and ")}`);
  }

  const description = parts.join(" ");
  return `Social Signal Context: This article is based on ${description}. High engagement indicates strong community sentiment. Consider this viral signal in the narrative.`;
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

    const socialContext = buildSocialContext(
      input.sourceType,
      input.engagement,
      input.metadata
    );

    const headlineMessages = buildAgentArticleHeadlinePrompt(
      input.companyName,
      summaries,
      uniqueThemes,
      agentConfig,
      socialContext
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
      socialContext
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
      socialContext
    );
    const bodyResult = await provider.completeStructured(
      bodyMessages,
      BodyResultSchema,
      { model, temperature: agentConfig.temperature }
    );

    log.debug("agent.article_generation.body_complete");

    const sanitizedHeadline = sanitizeArticleOutput(headlineResult.headline);
    const sanitizedSummary = sanitizeArticleOutput(summaryResult.summary);
    const sanitizedBody = sanitizeArticleOutput(bodyResult.body);

    const slug = createSlug(sanitizedHeadline);
    const latencyMs = Date.now() - startTime;

    log.info("agent.article_generation.complete", {
      latency_ms: latencyMs,
      slug,
    });

    return {
      title: sanitizedHeadline,
      slug,
      summary: sanitizedSummary,
      body: sanitizedBody,
    };
  } catch (error) {
    log.error("agent.article_generation.error", { error: String(error) });
    throw error;
  }
}

function sanitizeArticleOutput(text: string): string {
  return text.replace(/[^\x00-\x7F]/g, "");
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
