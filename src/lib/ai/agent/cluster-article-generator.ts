/**
 * Cluster article generation.
 * Generates synthesis articles that weave together multiple signals in a cluster.
 */

import { logger } from "@/lib/logger";
import { getProviderWithFailover } from "../provider";
import {
  buildClusterArticleHeadlinePrompt,
  buildClusterArticleSummaryPrompt,
  buildClusterArticleBodyPrompt,
} from "./prompts";
import { validateArticleBody, DEFAULT_CONFIG } from "../hallucination-guard";
import { z } from "zod";
import type { ProviderName } from "../provider";
import type { AgentConfig } from "./types";
import type { AgentArticleResult } from "./article-generator";

const HeadlineResultSchema = z.object({
  headline: z.string(),
});

const SummaryResultSchema = z.object({
  summary: z.string(),
});

const BodyResultSchema = z.object({
  body: z.string(),
});

const ImplicationResultSchema = z.object({
  implication: z.string(),
});

export interface ClusterArticleInput {
  label: string;
  summary: string | Record<string, unknown>;
  signals: Array<{
    id: string;
    title: string;
    sourceType: string;
    facts: Array<string | { text?: string }>;
  }>;
}

export interface ClusterCompanyInfo {
  name: string;
  ticker?: string;
}

/**
 * Generate a cluster synthesis article.
 *
 * Steps:
 * 1. Generate headline in agent voice
 * 2. Generate executive summary in agent voice
 * 3. Generate article body in agent voice
 * 4. Validate grounding against source signals
 * 5. Create URL slug from headline
 */
export async function generateClusterArticle(
  cluster: ClusterArticleInput,
  company: ClusterCompanyInfo,
  agentConfig: AgentConfig,
  providerName: ProviderName = "openai",
  model?: string
): Promise<AgentArticleResult> {
  const startTime = Date.now();
  const log = logger.child({
    clusterLabel: cluster.label,
    companyName: company.name,
    persona: agentConfig.persona,
    provider: providerName,
    signalCount: cluster.signals.length,
  });

  log.info("cluster_article_generation.start");

  try {
    const { provider } = getProviderWithFailover(providerName);

    // Generate headline
    const headlineMessages = buildClusterArticleHeadlinePrompt(
      cluster,
      company,
      agentConfig
    );
    const headlineResult = await provider.completeStructured(
      headlineMessages,
      HeadlineResultSchema,
      { model, temperature: agentConfig.temperature }
    );

    log.debug("cluster_article_generation.headline_complete", {
      headline: headlineResult.headline,
    });

    // Generate summary
    const summaryMessages = buildClusterArticleSummaryPrompt(
      cluster,
      company,
      agentConfig
    );
    const summaryResult = await provider.completeStructured(
      summaryMessages,
      SummaryResultSchema,
      { model, temperature: agentConfig.temperature }
    );

    log.debug("cluster_article_generation.summary_complete");

    // Generate body
    const bodyMessages = buildClusterArticleBodyPrompt(
      cluster,
      company,
      agentConfig
    );
    const bodyResult = await provider.completeStructured(
      bodyMessages,
      BodyResultSchema,
      { model, temperature: agentConfig.temperature }
    );

    log.debug("cluster_article_generation.body_complete");

    const sanitizedHeadline = sanitizeArticleOutput(headlineResult.headline);
    const sanitizedSummary = sanitizeArticleOutput(summaryResult.summary);
    const sanitizedBody = sanitizeArticleOutput(bodyResult.body);

    // Validate grounding against source signals
    const sourceAnalyses = cluster.signals.map((s) => ({
      summary: s.title,
      facts: s.facts.map((f) => (typeof f === "string" ? f : f.text || JSON.stringify(f))),
    }));

    const articleValidation = validateArticleBody(
      sanitizedBody,
      sourceAnalyses,
      { ...DEFAULT_CONFIG, groundingThreshold: 0.6 }
    );

    if (!articleValidation.isAcceptable) {
      log.warn("cluster_article_generation.low_grounding", {
        groundingScore: articleValidation.groundingScore,
        threshold: 0.6,
        ungroundedClaims: articleValidation.ungroundedClaims.slice(0, 5),
      });
    }

    const slug = createSlug(sanitizedHeadline);
    const latencyMs = Date.now() - startTime;

    log.info("cluster_article_generation.complete", {
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
    log.error("cluster_article_generation.error", { error: String(error) });
    throw error;
  }
}

function sanitizeArticleOutput(text: string): string {
  // Remove control characters but preserve Unicode text (emojis, international chars, etc.)
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
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

/**
 * Generate a strategic implication statement for a cluster.
 * Returns a 2-3 sentence "so what" paragraph for investment analysts.
 */
export async function generateClusterImplication(
  clusterLabel: string,
  clusterSummary: string | Record<string, unknown>,
  keyFacts: string[],
  companyName: string
): Promise<string> {
  const startTime = Date.now();
  const log = logger.child({
    clusterLabel,
    companyName,
  });

  log.info("cluster_implication_generation.start");

  try {
    const { provider } = getProviderWithFailover("openai");

    const summaryText = typeof clusterSummary === "string"
      ? clusterSummary
      : (clusterSummary.summary as string) || `${clusterLabel}: Analysis of related signals`;

    const factsText = keyFacts.length > 0
      ? keyFacts.slice(0, 5).map((f, i) => `${i + 1}. ${f}`).join("\n")
      : "No specific facts available";

    const messages = [
      {
        role: "system" as const,
        content: `You are a corporate intelligence analyst writing for investment professionals.
Generate a concise strategic implication statement (2-3 sentences) that answers "so what?" for an investment analyst.

Focus on:
- What this pattern means for the company's strategic direction
- Potential investment implications or risks
- What analysts should watch for next

Be direct, actionable, and avoid jargon. Write for someone making investment decisions.`,
      },
      {
        role: "user" as const,
        content: `Company: ${companyName}
Strategic Theme: ${clusterLabel}

Summary: ${summaryText}

Key Facts:
${factsText}

Generate a 2-3 sentence strategic implication statement for an investment analyst.`,
      },
    ];

    const result = await provider.completeStructured(
      messages,
      ImplicationResultSchema,
      { temperature: 0.4 }
    );

    const sanitized = sanitizeArticleOutput(result.implication);

    log.info("cluster_implication_generation.complete", {
      latency_ms: Date.now() - startTime,
      implicationLength: sanitized.length,
    });

    return sanitized;
  } catch (error) {
    log.error("cluster_implication_generation.error", { error: String(error) });
    throw error;
  }
}
