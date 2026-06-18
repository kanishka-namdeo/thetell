---
name: article-generation
description: Use when publishing analysis results, generating news-style articles from structured analysis, or creating readable content from insights
---

# Article Generation

## Overview

Transform structured analysis into readable, engaging articles. The pipeline produces news-style content with proper attribution, citation tracking, and editorial review before publishing.

## When to Use

- Publishing analysis results to users
- Generating daily/weekly digests
- Creating shareable content from insights
- Building any feature that presents analysis in human-readable form
- Scenarios requiring source attribution and evidence

## Architecture

```
Analysis Results → generate_headline → generate_summary → generate_body → edit_review → publish
```

Each step uses the LLM provider with Zod schemas for structured output.

## Implementation

### Entry Point

```typescript
// src/lib/ai/article-generator.ts
import { getProvider } from "@/lib/ai/provider";
import { z } from "@/lib/ai/zod";
import { logger } from "@/lib/logger";
import type { AnalysisResult } from "@/lib/ai/pipeline";

export interface ArticleInput {
  signalId: string;
  analysis: AnalysisResult;
  sources: Array<{
    url: string;
    title: string;
    credibility: "official" | "news" | "social";
  }>;
}

export interface GeneratedArticle {
  headline: string;
  summary: string;
  body: string;
  citations: Array<{
    sourceUrl: string;
    sourceTitle: string;
    quotedText: string;
  }>;
  keyTakeaways: string[];
}

const HeadlineSchema = z.object({
  headline: z.string().max(100),
  headline_type: z.enum(["question", "revelation", "prediction", "contrast"]),
});

const SummarySchema = z.object({
  summary: z.string(),
  key_insight: z.string(),
});

const CitationSchema = z.object({
  source_url: z.string().url(),
  source_title: z.string(),
  quoted_text: z.string(),
});

const ArticleBodySchema = z.object({
  body: z.string(),
  citations: z.array(CitationSchema),
  key_takeaways: z.array(z.string()).min(3).max(5),
});

export async function generateArticle(input: ArticleInput): Promise<GeneratedArticle> {
  const log = logger.child({ signalId: input.signalId });
  const provider = getProvider("openai");

  try {
    log.info("article_generation.start");

    // Step 1: Generate headline
    const headlineResult = await provider.completeStructured(
      [
        {
          role: "system",
          content: `You are a corporate intelligence journalist. Write accurate, engaging headlines. Tone: analytical, not sensational. Match confidence level to tone.`,
        },
        {
          role: "user",
          content: `Analysis summary: ${input.analysis.summary}\nConfidence: ${input.analysis.confidence}`,
        },
      ],
      HeadlineSchema,
    );

    // Step 2: Generate lead paragraph
    const summaryResult = await provider.completeStructured(
      [
        {
          role: "system",
          content: `Write a 2-3 sentence lead paragraph for a corporate intelligence article.`,
        },
        {
          role: "user",
          content: `Headline: ${headlineResult.headline}\nKey insight: ${input.analysis.summary}`,
        },
      ],
      SummarySchema,
    );

    // Step 3: Generate body with citations
    const sourceList = input.sources
      .map((s) => `- ${s.title} (${s.url}) credibility=${s.credibility}`)
      .join("\n");

    const bodyResult = await provider.completeStructured(
      [
        {
          role: "system",
          content: `Write the full article body in markdown. Include inline citations to sources. Use journalistic tone. Structure: context, key findings, implications.`,
        },
        {
          role: "user",
          content: `Headline: ${headlineResult.headline}\nSummary: ${summaryResult.summary}\nFacts: ${input.analysis.facts.map((f) => f.text).join("; ")}\nThemes: ${input.analysis.themes.map((t) => t.label).join(", ")}\nAvailable sources:\n${sourceList}`,
        },
      ],
      ArticleBodySchema,
    );

    const article: GeneratedArticle = {
      headline: headlineResult.headline,
      summary: summaryResult.summary,
      body: bodyResult.body,
      citations: bodyResult.citations.map((c) => ({
        sourceUrl: c.source_url,
        sourceTitle: c.source_title,
        quotedText: c.quoted_text,
      })),
      keyTakeaways: bodyResult.key_takeaways,
    };

    log.info("article_generation.complete");
    return article;
  } catch (error) {
    log.error("article_generation.failed", { error: String(error) });
    throw error;
  }
}
```

## Citation Tracking

Citations link every factual claim back to a source. The LLM is given available sources and instructed to cite them inline.

```typescript
// Citations are validated by the Zod schema:
// - source_url must be a valid URL
// - quoted_text must be non-empty
// - Every factual claim in the body should have a matching citation
```

## Headline Patterns

| Pattern | Example | When to Use |
|---------|---------|-------------|
| Question | "Is OpenAI Pivoting Away from Non-Profit?" | Uncertain implications |
| Revelation | "Stripe's Hidden Push into B2B Payments" | Unexpected finding |
| Prediction | "Why Anthropic's Latest Move Signals IPO Prep" | Forward-looking analysis |
| Contrast | "Meta's AI Spending Surges as Revenue Stalls" | Conflicting signals |

## Tone Guidelines

- **Analytical, not sensational**: "Company X shows signs of Y" not "Company X SHOCKS with Y"
- **Confident, not arrogant**: "Evidence suggests" not "It's obvious that"
- **Specific, not vague**: "Revenue grew 23% QoQ" not "Revenue increased significantly"
- **Attributed, not anonymous**: "According to SEC filing" not "Reports show"
- **Confidence-aware**: Low confidence → speculative tone; high confidence → direct tone

## Common Mistakes

### Mistake 1: Monolithic Generation

**Bad:**
```typescript
const article = await provider.complete(messages); // One giant prompt
```

**Good:**
```typescript
// Structured pipeline with focused prompts per step
const headline = await provider.completeStructured(headlineMessages, HeadlineSchema);
const summary = await provider.completeStructured(summaryMessages, SummarySchema);
const body = await provider.completeStructured(bodyMessages, ArticleBodySchema);
```

**Why:** Structured generation produces consistent output; monolithic prompts are unpredictable.

### Mistake 2: No Citation Tracking

**Bad:**
```typescript
return { body: articleText }; // Claims are unverifiable
```

**Good:**
```typescript
return { body: bodyResult.body, citations: bodyResult.citations };
```

**Why:** Without citations, readers cannot verify claims. Citation tracking ensures every factual statement links back to a source.

### Mistake 3: Sensational Tone

**Bad:**
```typescript
// System prompt: "Write an exciting, attention-grabbing article!"
```

**Good:**
```typescript
// System prompt: "Write accurate, engaging headlines. Tone: analytical, not sensational."
```

**Why:** Corporate intelligence requires trust. Sensationalism erodes credibility.

## Quick Reference

| Pattern | Code |
|---------|------|
| **Article generation** | `generateArticle({ signalId, analysis, sources })` |
| **Headline schema** | `z.object({ headline, headline_type })` |
| **Body schema** | `z.object({ body, citations, key_takeaways })` |
| **Citation schema** | `z.object({ source_url, source_title, quoted_text })` |
| **Implementation** | `src/lib/ai/article-generator.ts` |

## Related Skills

- **signal-analysis** — Upstream analysis that feeds into article generation
- **llm-abstraction** — LLM provider abstraction with structured outputs
- **data-modeling** — Zod schema design for article output
