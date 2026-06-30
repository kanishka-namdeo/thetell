/**
 * Agent-aware article generation.
 * Generates articles with agent-specific voice and optional cross-reference context.
 */

import { logger } from "@/lib/logger";
import { getProviderWithFailover } from "../provider";
import {
  buildAgentArticleHeadlinePrompt,
  buildAgentArticleSummaryPrompt,
  buildAgentArticleBodyPrompt,
  buildCrossRefContext,
} from "./prompts";
import { validateArticleBody, isThinContent, DEFAULT_CONFIG } from "../hallucination-guard";
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
    keyFacts: Array<{ text: string; source_sentence?: string }>;
    sentiment: string;
    strategicThemes: Array<{ label: string }>;
  }>;
  agentPersona?: AgentPersona;
  sourceType?: string;
  /** Raw source text for thin content detection */
  sourceText?: string;
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
  /** Indicates if article was skipped due to thin content or persona mismatch */
  skipped?: boolean;
  skipReason?: string;
  /** Grounding score (percentage of claims traceable to source) */
  groundingScore?: number;
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
    // Layer 4: Persona-source matching gate
    // Skip article generation if persona doesn't match source type AND content is thin
    const sourceMatchesPersona = input.sourceType && agentConfig.sourcePreferences.includes(input.sourceType);
    
    // Check if content is thin (low information density)
    const sourceText = input.sourceText || 
      input.analyses.map(a => `${a.summary}\n${a.keyFacts.map(f => f.text).join("\n")}`).join("\n\n");
    const isThin = isThinContent(sourceText);
    
    if (!sourceMatchesPersona && isThin) {
      log.warn("agent.article_generation.skipped_persona_mismatch", {
        sourceType: input.sourceType,
        personaPreferences: agentConfig.sourcePreferences,
        isThin,
        skipReason: "Persona does not match source type and content is too thin for dramatic interpretation",
      });
      
      return {
        title: "",
        slug: "",
        summary: "",
        body: "",
        skipped: true,
        skipReason: `Persona ${agentConfig.persona} prefers ${agentConfig.sourcePreferences.join(", ")} sources, but source is ${input.sourceType || "unknown"}. Content is too thin for dramatic interpretation without fabrication risk.`,
      };
    }

    const { provider } = getProviderWithFailover(providerName);

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

    // Build cross-reference context from the other agent's analysis
    const crossRefContext = buildCrossRefContext(crossRefAnalyses);

    const bodyMessages = buildAgentArticleBodyPrompt(
      input.companyName,
      headlineResult.headline,
      summaryResult.summary,
      analysesForBody,
      agentConfig,
      socialContext,
      crossRefContext || undefined
    );
    const bodyResult = await provider.completeStructured(
      bodyMessages,
      BodyResultSchema,
      { model, temperature: agentConfig.temperature }
    );

    log.debug("agent.article_generation.body_complete");

    const sanitizedHeadline = sanitizeArticleOutput(headlineResult.headline);
    const sanitizedSummary = sanitizeArticleOutput(summaryResult.summary);
    const sanitizedBody = fixHeaderFormatting(sanitizeArticleOutput(bodyResult.body));

    // Validate article output is non-empty and well-formed
    const validationError = validateArticleOutput(
      sanitizedHeadline,
      sanitizedSummary,
      sanitizedBody
    );
    if (validationError) {
      log.warn("agent.article_generation.validation_failed", {
        error: validationError,
        titleLength: sanitizedHeadline.length,
        summaryLength: sanitizedSummary.length,
        bodyLength: sanitizedBody.length,
      });
      return {
        title: sanitizedHeadline,
        slug: "",
        summary: sanitizedSummary,
        body: sanitizedBody,
        skipped: true,
        skipReason: validationError,
      };
    }

    // Layer 2: Post-generation grounding check
    // Validate that article claims are traceable to source analyses
    const articleValidation = validateArticleBody(
      sanitizedBody,
      analysesForBody,
      { ...DEFAULT_CONFIG, groundingThreshold: 0.6 }
    );

    if (!articleValidation.isAcceptable) {
      log.warn("agent.article_generation.low_grounding", {
        groundingScore: articleValidation.groundingScore,
        threshold: 0.6,
        ungroundedClaims: articleValidation.ungroundedClaims.slice(0, 5),
      });
    }

    const slug = createSlug(sanitizedHeadline);
    const latencyMs = Date.now() - startTime;

    log.info("agent.article_generation.complete", {
      latency_ms: latencyMs,
      slug,
      groundingScore: articleValidation.groundingScore,
    });

    return {
      title: sanitizedHeadline,
      slug,
      summary: sanitizedSummary,
      body: sanitizedBody,
      groundingScore: articleValidation.groundingScore,
    };
  } catch (error) {
    log.error("agent.article_generation.error", { error: String(error) });
    throw error;
  }
}

function sanitizeArticleOutput(text: string): string {
  return text.replace(/[\x00-\x1F\x7F]/g, "");
}

/**
 * Ensure markdown headers have a newline after them.
 * Fixes LLM output like "## The TellContent..." → "## The Tell\nContent..."
 */
function fixHeaderFormatting(text: string): string {
  // Match ## headers that are immediately followed by non-whitespace content
  return text.replace(/^(##\s+[^\n#]+)([A-Za-z0-9])/gm, "$1\n$2");
}

/**
 * Validate that article output is non-empty and well-formed.
 * Returns an error message if invalid, or null if valid.
 */
function validateArticleOutput(
  title: string,
  summary: string,
  body: string
): string | null {
  if (!title || title.trim().length === 0) {
    return "Article title is empty";
  }
  if (!summary || summary.trim().length < 20) {
    return `Article summary is too short (${summary.trim().length} chars, minimum 20)`;
  }
  if (!body || body.trim().length < 100) {
    return `Article body is too short (${body.trim().length} chars, minimum 100)`;
  }
  return null;
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
