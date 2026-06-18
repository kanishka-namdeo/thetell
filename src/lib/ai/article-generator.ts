/**
 * Article generation from analysis results.
 * Translated from backend/app/article_generation/generator.py
 */

import { logger } from "@/lib/logger";
import { getProvider } from "./provider";
import {
  buildArticleHeadlinePrompt,
  buildArticleSummaryPrompt,
  buildArticleBodyPrompt,
} from "./prompts";
import { z } from "zod";
import type { ProviderName } from "./provider";

const HeadlineResultSchema = z.object({
  headline: z.string(),
});

const SummaryResultSchema = z.object({
  summary: z.string(),
});

const BodyResultSchema = z.object({
  body: z.string(),
});

export interface ArticleInput {
  companyId: string;
  companyName: string;
  analyses: Array<{
    summary: string;
    keyFacts: Array<{ text: string }>;
    sentiment: string;
    strategicThemes: Array<{ label: string }>;
  }>;
}

export interface ArticleResult {
  title: string;
  slug: string;
  summary: string;
  body: string;
}

/**
 * Generate a news-style article from analysis results.
 *
 * Steps:
 * 1. Generate headline from summaries and themes
 * 2. Generate executive summary
 * 3. Generate article body
 * 4. Create URL slug from headline
 */
export async function generateArticle(
  input: ArticleInput,
  providerName: ProviderName = "openai",
  model?: string
): Promise<ArticleResult> {
  const startTime = Date.now();
  const log = logger.child({
    companyId: input.companyId,
    provider: providerName,
  });

  log.info("article_generation.start", {
    analyses_count: input.analyses.length,
  });

  try {
    const provider = getProvider(providerName);

    // Extract summaries and themes for headline generation
    const summaries = input.analyses.map((a) => a.summary);
    const allThemes = input.analyses.flatMap((a) =>
      a.strategicThemes.map((t) => t.label)
    );
    const uniqueThemes = [...new Set(allThemes)];

    // Step 1: Generate headline
    const headlineMessages = buildArticleHeadlinePrompt(
      input.companyName,
      summaries,
      uniqueThemes
    );
    const headlineResult = await provider.completeStructured(
      headlineMessages,
      HeadlineResultSchema,
      { model, temperature: 0.6 }
    );

    log.debug("article_generation.headline_complete", {
      headline: headlineResult.headline,
    });

    // Step 2: Generate executive summary
    const summaryMessages = buildArticleSummaryPrompt(
      input.companyName,
      headlineResult.headline,
      summaries,
      uniqueThemes
    );
    const summaryResult = await provider.completeStructured(
      summaryMessages,
      SummaryResultSchema,
      { model, temperature: 0.5 }
    );

    log.debug("article_generation.summary_complete");

    // Step 3: Generate article body
    const analysesForBody = input.analyses.map((a) => ({
      summary: a.summary,
      facts: a.keyFacts.map((f) => f.text),
      sentiment: a.sentiment,
    }));

    const bodyMessages = buildArticleBodyPrompt(
      input.companyName,
      headlineResult.headline,
      summaryResult.summary,
      analysesForBody
    );
    const bodyResult = await provider.completeStructured(
      bodyMessages,
      BodyResultSchema,
      { model, temperature: 0.6 }
    );

    log.debug("article_generation.body_complete");

    // Step 4: Create slug from headline
    const slug = createSlug(headlineResult.headline);

    const latencyMs = Date.now() - startTime;

    log.info("article_generation.complete", {
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
    log.error("article_generation.error", { error: String(error) });
    throw error;
  }
}

/**
 * Create a URL-friendly slug from a headline.
 */
function createSlug(headline: string): string {
  const timestamp = Date.now();
  const slugified = headline
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove special chars
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .trim()
    .slice(0, 60); // Limit length

  return `${slugified}-${timestamp}`;
}
