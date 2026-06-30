/**
 * URL discovery engine — LLM-driven query generation and relevance scoring.
 *
 * Generates targeted search queries from company context, hypotheses, and themes,
 * then scores raw search results to filter low-relevance URLs before signal creation.
 */

import { z } from "zod";
import { getProviderWithFailover } from "./provider";
import { logger } from "@/lib/logger";
import type { Company, CompanyHypothesis, SignalTheme } from "@prisma/client";

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const SearchQueryItemSchema = z.object({
  query: z
    .string()
    .describe('Search query string, e.g. "Apple India manufacturing expansion 2026"'),
  sourceType: z
    .string()
    .describe("Source type enum value: NEWS, BLOG, JOB_POSTING, FILING, SOCIAL, etc."),
  rationale: z
    .string()
    .describe("Why this query is relevant, e.g. 'Hypothesis: expanding India manufacturing'"),
  priority: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("Priority rank 1-10 (10 = highest strategic significance, 1 = lowest)"),
});

export const SearchQuerySchema = z.object({
  queries: z.array(SearchQueryItemSchema).max(10),
});

export type SearchQuery = z.infer<typeof SearchQueryItemSchema>;
export type SearchQueryOutput = z.infer<typeof SearchQuerySchema>;

const ScoredURLItemSchema = z.object({
  url: z.string().url(),
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Relevance score 0-1 for how likely this URL contains a useful signal"),
  sourceType: z
    .string()
    .describe("Best-fit source type: NEWS, BLOG, FILING, JOB_POSTING, etc."),
  rationale: z
    .string()
    .describe("Brief explanation of why this URL is relevant to the company"),
});

export const ScoredURLSchema = z.object({
  results: z.array(ScoredURLItemSchema),
});

export type ScoredURL = z.infer<typeof ScoredURLItemSchema>;
export type ScoredURLOutput = z.infer<typeof ScoredURLSchema>;

// ─── Input Types ────────────────────────────────────────────────────────────

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  publishedAt?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const RELEVANCE_THRESHOLD = 0.4;

const SOURCE_TYPE_HINTS = [
  "NEWS",
  "FILING",
  "TRANSCRIPT",
  "SOCIAL",
  "BLOG",
  "JOB_POSTING",
  "RSS",
  "PATENT",
  "LITIGATION",
  "FDA",
  "CONTRACT",
  "TECH_SIGNAL",
  "WEB_ARCHIVE",
  "LEGISLATION",
  "ACADEMIC",
  "PODCAST",
  "CONFERENCE",
  "PRESS_RELEASE",
  "LOBBYING",
] as const;

// ─── Query Generation ───────────────────────────────────────────────────────

/**
 * Generate targeted search queries for a company using LLM.
 *
 * When hypotheses are available, queries are weighted toward the source types
 * indicated by hypothesis sourceWeights. When themes are provided, queries
 * target high-momentum strategic areas. Falls back to simple name/ticker/sector
 * queries if the LLM call fails.
 */
export async function generateSearchQueries(
  company: Company,
  hypotheses?: CompanyHypothesis[],
  themes?: SignalTheme[]
): Promise<SearchQuery[]> {
  const log = logger.child({
    module: "url-discovery",
    companyId: company.id,
    functionName: "generateSearchQueries",
  });

  const { provider } = getProviderWithFailover("openai");

  const activeHypotheses = (hypotheses ?? []).filter(
    (h) => h.status === "ACTIVE"
  );
  const topThemes = (themes ?? [])
    .filter((t) => t.status !== "FADING" && t.status !== "RESOLVED")
    .sort((a, b) => b.momentum - a.momentum)
    .slice(0, 5);

  const hasHypotheses = activeHypotheses.length > 0;
  const hasThemes = topThemes.length > 0;

  const messages = [
    {
      role: "system" as const,
      content: `You are a corporate intelligence search strategist. Your job is to generate targeted search queries that will uncover public signals (news, filings, blog posts, job listings, social media, patents, etc.) about a company.

Rules:
- Generate 5-10 diverse queries spanning multiple source types
- Each query must be specific and actionable — not generic company name searches
- Use sourceType values from this list: ${SOURCE_TYPE_HINTS.join(", ")}
- Prioritize queries that are likely to surface recent, actionable signals
${
  hasHypotheses
    ? `- IMPORTANT: Weight queries toward source types indicated by active hypotheses' sourceWeights. If a hypothesis has high weight for JOB_POSTING, generate job-search queries.`
    : ""
}
${
  hasThemes
    ? `- IMPORTANT: Generate queries targeting high-momentum themes to find corroborating or contradicting signals.`
    : ""
}
- Priority (integer 1-10, 10 = highest): reflect hypothesis alignment, theme momentum, likelihood of finding actionable content
- Include a brief rationale for each query`,
    },
    {
      role: "user" as const,
      content: buildQueryPromptContent(company, activeHypotheses, topThemes),
    },
  ];

  try {
    const result = await provider.completeStructured(
      messages,
      SearchQuerySchema,
      { temperature: 0.5 }
    );

    log.info("url_discovery.queries_generated", {
      queryCount: result.queries.length,
      hasHypotheses,
      hasThemes,
    });

    return result.queries;
  } catch (error) {
    log.error("url_discovery.query_generation_failed", {
      error: String(error),
    });

    return generateFallbackQueries(company);
  }
}

function buildQueryPromptContent(
  company: Company,
  hypotheses: CompanyHypothesis[],
  themes: SignalTheme[]
): string {
  const parts: string[] = [`Company: ${company.name}`];

  if (company.ticker) {
    parts.push(`Ticker: ${company.ticker}`);
  }
  if (company.description) {
    parts.push(`Description: ${company.description.slice(0, 300)}`);
  }
  if (company.websiteUrl) {
    parts.push(`Website: ${company.websiteUrl}`);
  }

  if (hypotheses.length > 0) {
    parts.push(
      `\nActive Hypotheses (${hypotheses.length}):`
    );
    for (const h of hypotheses.slice(0, 5)) {
      const evidence = h.evidence as Array<{ sourceWeights?: Array<{ source: string; weight: number }> }>;
      const sourceWeights = evidence?.[0]?.sourceWeights ?? [];
      const topSources = sourceWeights
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3)
        .map((sw) => `${sw.source}(${sw.weight.toFixed(1)})`)
        .join(", ");

      parts.push(
        `- "${h.title}" (confidence: ${h.confidence.toFixed(2)})${topSources ? ` → top sources: ${topSources}` : ""}`
      );
    }
  }

  if (themes.length > 0) {
    parts.push(`\nTop Themes (${themes.length}):`);
    for (const t of themes) {
      parts.push(
        `- "${t.label}" (momentum: ${t.momentum.toFixed(2)}, status: ${t.status})`
      );
    }
  }

  parts.push(
    "\nGenerate search queries that will uncover public signals relevant to this company's strategic activity."
  );

  return parts.join("\n");
}

/**
 * Fallback query generation when LLM is unavailable.
 * Produces simple queries from company name, ticker, and description keywords.
 */
function generateFallbackQueries(company: Company): SearchQuery[] {
  const queries: SearchQuery[] = [];
  const name = company.name;
  const ticker = company.ticker;

  queries.push({
    query: `${name} latest news`,
    sourceType: "NEWS",
    rationale: "General news coverage",
    priority: 5,
  });

  queries.push({
    query: `${name} press release`,
    sourceType: "PRESS_RELEASE",
    rationale: "Official company announcements",
    priority: 5,
  });

  if (ticker) {
    queries.push({
      query: `$${ticker} SEC filing`,
      sourceType: "FILING",
      rationale: "Regulatory filings via ticker symbol",
      priority: 6,
    });
  }

  if (company.description) {
    const keywords = extractKeywords(company.description);
    if (keywords.length > 0) {
      queries.push({
        query: `${name} ${keywords[0]}`,
        sourceType: "NEWS",
        rationale: `Sector keyword search: ${keywords[0]}`,
        priority: 4,
      });
    }
  }

  queries.push({
    query: `${name} hiring jobs`,
    sourceType: "JOB_POSTING",
    rationale: "Hiring signals reveal strategic direction",
    priority: 4,
  });

  return queries;
}

/**
 * Extract top keywords from a description string.
 */
function extractKeywords(description: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "and", "or", "but",
    "in", "on", "at", "to", "for", "of", "with", "by", "from", "that",
    "this", "it", "its", "as", "be", "has", "had", "have", "company",
    "which", "their", "there", "they", "been", "than", "into", "we",
  ]);

  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .slice(0, 5);
}

// ─── Content Relevance Classification ───────────────────────────────────────

const ContentRelevanceSchema = z.object({
  relevant: z.boolean().describe("Whether this article is primarily about the specified company"),
  confidence: z.number().min(0).max(1).describe("Confidence in the relevance judgment"),
  reasoning: z.string().describe("Brief explanation of why the article is or isn't about the company"),
});

export type ContentRelevance = z.infer<typeof ContentRelevanceSchema>;

/**
 * Classify whether scraped article content is actually about a specific company.
 *
 * Uses LLM to understand context — distinguishes "Apple announces new iPhone"
 * from "Apple pie recipe" or "WD SSD deal mentioning Mac compatibility".
 *
 * Designed to be called AFTER a fast string pre-filter (checkCompanyRelevance)
 * to avoid LLM calls on obviously irrelevant content.
 */
export async function classifyContentRelevance(
  title: string,
  contentHead: string,
  company: { name: string; ticker: string | null; description: string | null }
): Promise<ContentRelevance> {
  const log = logger.child({
    module: "url-discovery",
    companyName: company.name,
    functionName: "classifyContentRelevance",
  });

  const { provider } = getProviderWithFailover("openai");

  const messages = [
    {
      role: "system" as const,
      content: `You are a corporate intelligence relevance classifier. Your job is to determine whether an article is PRIMARILY about a specific company.

Key rules:
- The article must be primarily ABOUT the company, not just mention it in passing
- A product review that mentions "compatible with Mac" is NOT primarily about Apple
- A deal article about a competitor's product is NOT about Apple even if it mentions Apple
- An article about the fruit "apple" is NOT about Apple Inc
- An article about Apple's products, strategy, earnings, executives, or business IS about Apple
- When the company name is a common word (Apple, Shell, Meta, Amazon), be extra strict
- The ticker symbol (${company.ticker ?? "N/A"}) is a strong signal — if present, the article is likely about the company
- Consider the company's description to understand what it does

Respond with relevant=true only if the article's PRIMARY subject is the company.`,
    },
    {
      role: "user" as const,
      content: `Company: ${company.name}${company.ticker ? ` (${company.ticker})` : ""}
${company.description ? `Description: ${company.description.slice(0, 200)}` : ""}

Article title: ${title}
Article content (first 1000 chars):
${contentHead.slice(0, 1000)}

Is this article primarily about ${company.name}?`,
    },
  ];

  try {
    const result = await provider.completeStructured(messages, ContentRelevanceSchema, {
      temperature: 0.2,
    });

    log.info("content_relevance.classified", {
      companyName: company.name,
      relevant: result.relevant,
      confidence: result.confidence,
    });

    return result;
  } catch (error) {
    log.error("content_relevance.classification_failed", {
      error: String(error),
    });

    // Fall back to permissive — let the signal through if LLM fails
    return { relevant: true, confidence: 0.5, reasoning: "LLM classification failed, defaulting to permissive" };
  }
}

// ─── Relevance Scoring ──────────────────────────────────────────────────────

/**
 * Score search results for relevance to a company using LLM.
 *
 * Evaluates each result's likelihood of containing a useful signal,
 * assigns a source type, and filters out results below the relevance threshold.
 */
export async function scoreRelevance(
  results: SearchResult[],
  company: Company
): Promise<ScoredURL[]> {
  const log = logger.child({
    module: "url-discovery",
    companyId: company.id,
    functionName: "scoreRelevance",
  });

  if (results.length === 0) {
    return [];
  }

  const { provider } = getProviderWithFailover("openai");

  const resultsSummary = results.slice(0, 30).map((r) => ({
    url: r.url,
    title: r.title.slice(0, 150),
    snippet: r.snippet.slice(0, 250),
    publishedAt: r.publishedAt ?? "unknown",
  }));

  const messages = [
    {
      role: "system" as const,
      content: `You are a corporate intelligence relevance scorer. Given search results for a company, evaluate each result's likelihood of containing an actionable public signal.

Scoring guidelines:
- 0.8-1.0: Directly about the company with strategic content (earnings, product launches, executive changes, partnerships, regulatory filings)
- 0.6-0.79: About the company or its industry with potentially useful context (competitor news, sector trends mentioning the company)
- 0.4-0.59: Tangentially related — mentions the company but mostly generic content
- Below 0.4: Not relevant — different company with similar name, generic industry filler, spam, directories, link aggregators

Rules:
- Score ALL results provided
- Assign the most appropriate sourceType from: ${SOURCE_TYPE_HINTS.join(", ")}
- Be strict: filter out results that are clearly not about THIS specific company
- Include a brief rationale for each score
- Return results sorted by score descending`,
    },
    {
      role: "user" as const,
      content: `Company: ${company.name}${company.ticker ? ` (${company.ticker})` : ""}
${company.description ? `Description: ${company.description.slice(0, 300)}` : ""}

Search Results (${resultsSummary.length}):
${JSON.stringify(resultsSummary, null, 2)}

Score each result for relevance to ${company.name}.`,
    },
  ];

  try {
    const scored = await provider.completeStructured(
      messages,
      ScoredURLSchema,
      { temperature: 0.3 }
    );

    const filtered = scored.results
      .filter((r) => r.score >= RELEVANCE_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    log.info("url_discovery.results_scored", {
      totalResults: results.length,
      scoredResults: scored.results.length,
      passedThreshold: filtered.length,
      threshold: RELEVANCE_THRESHOLD,
    });

    return filtered;
  } catch (error) {
    log.error("url_discovery.scoring_failed", {
      error: String(error),
    });

    return fallbackScore(results, company);
  }
}

/**
 * Fallback scoring when LLM is unavailable.
 * Uses simple heuristics: URL/title containing company name gets a moderate score.
 */
function fallbackScore(
  results: SearchResult[],
  company: Company
): ScoredURL[] {
  const companyNameLower = company.name.toLowerCase();
  const tickerLower = company.ticker?.toLowerCase();

  const scored: ScoredURL[] = [];

  for (const result of results) {
    const titleLower = result.title.toLowerCase();
    const snippetLower = result.snippet.toLowerCase();
    const urlLower = result.url.toLowerCase();

    let score = 0;

    if (titleLower.includes(companyNameLower)) score += 0.4;
    if (snippetLower.includes(companyNameLower)) score += 0.2;
    if (tickerLower && titleLower.includes(tickerLower)) score += 0.2;
    if (tickerLower && snippetLower.includes(tickerLower)) score += 0.1;

    if (score < RELEVANCE_THRESHOLD) continue;

    let sourceType = "NEWS";
    if (urlLower.includes("sec.gov") || urlLower.includes("edgar")) {
      sourceType = "FILING";
    } else if (urlLower.includes("jobs") || urlLower.includes("careers")) {
      sourceType = "JOB_POSTING";
    } else if (urlLower.includes("blog")) {
      sourceType = "BLOG";
    } else if (urlLower.includes("patent")) {
      sourceType = "PATENT";
    }

    scored.push({
      url: result.url,
      score: Math.min(score, 1.0),
      sourceType,
      rationale: "Heuristic fallback scoring (LLM unavailable)",
    });
  }

  return scored.sort((a, b) => b.score - a.score);
}
