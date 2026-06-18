---
name: signal-analysis
description: Use when processing scraped data into analysis-ready format, extracting insights from raw public signals, or working with the TypeScript analysis pipeline
---

# Signal Analysis

## Overview

Transform raw public data (news articles, SEC filings, social media posts) into structured insights through a **multi-stage analysis pipeline**. The pipeline converts unstructured text into actionable intelligence about company operations.

## When to Use

- Processing scraped news articles or press releases
- Analyzing SEC filings (10-K, 10-Q, 8-K)
- Extracting insights from social media mentions
- Building any feature that requires understanding company behavior
- Converting raw text into structured data for downstream consumption
- Scoring confidence in extracted insights

## Architecture

Pipeline: `extract_facts → classify_sentiment → identify_themes → score_confidence → generate_summary`

Each stage uses the LLM provider abstraction with Zod schemas for structured output validation.

## Implementation

### Pipeline Entry Point

```typescript
// src/lib/ai/pipeline.ts
import { getProvider } from "@/lib/ai/provider";
import { extractFacts } from "@/lib/ai/fact-extraction";
import { classifySentiment } from "@/lib/ai/sentiment";
import { identifyThemes } from "@/lib/ai/themes";
import { scoreConfidence } from "@/lib/ai/confidence";
import { generateSummary } from "@/lib/ai/summary";
import { logger } from "@/lib/logger";

export interface AnalysisInput {
  signalId: string;
  rawText: string;
  companyId: string;
  sourceType: string;
}

export interface AnalysisResult {
  facts: Array<{
    text: string;
    category: string;
    confidence: number;
  }>;
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  themes: Array<{
    label: string;
    evidence: string[];
  }>;
  confidence: number;
  summary: string;
}

export async function analyzeSignal(input: AnalysisInput): Promise<AnalysisResult> {
  const log = logger.child({ signalId: input.signalId });
  
  try {
    log.info("analysis.start");
    
    // Stage 1: Extract facts
    const facts = await extractFacts(input.rawText);
    log.info("analysis.facts_extracted", { count: facts.length });
    
    // Stage 2: Classify sentiment
    const sentiment = await classifySentiment(input.rawText);
    log.info("analysis.sentiment_classified", { sentiment: sentiment.sentiment });
    
    // Stage 3: Identify themes
    const themes = await identifyThemes(input.rawText);
    log.info("analysis.themes_identified", { count: themes.length });
    
    // Stage 4: Score confidence
    const confidence = await scoreConfidence(facts, themes);
    log.info("analysis.confidence_scored", { confidence: confidence.score });
    
    // Stage 5: Generate summary
    const summary = await generateSummary(input.rawText, facts, sentiment, themes);
    log.info("analysis.summary_generated");
    
    const result: AnalysisResult = {
      facts,
      sentiment: sentiment.sentiment,
      themes,
      confidence: confidence.score,
      summary,
    };
    
    log.info("analysis.complete");
    return result;
  } catch (error) {
    log.error("analysis.failed", { error: String(error) });
    throw error;
  }
}
```

### Fact Extraction

```typescript
// src/lib/ai/fact-extraction.ts
import { z } from "zod";
import { getProvider } from "@/lib/ai/provider";

const FactSchema = z.object({
  text: z.string().describe("The fact statement"),
  category: z.enum(["financial", "strategic", "operational", "personnel", "market"]),
  confidence: z.number().min(0).max(1).describe("Confidence in this fact"),
});

const FactExtractionSchema = z.object({
  facts: z.array(FactSchema),
});

export async function extractFacts(text: string) {
  const provider = getProvider("openai");
  
  const result = await provider.completeStructured(
    [
      {
        role: "system",
        content: `Extract key facts from corporate signals. Identify entities, actions, and strategic implications. Focus on concrete, verifiable information.`,
      },
      { role: "user", content: text },
    ],
    FactExtractionSchema,
  );
  
  return result.facts;
}
```

### Sentiment Classification

```typescript
// src/lib/ai/sentiment.ts
import { z } from "zod";
import { getProvider } from "@/lib/ai/provider";

const SentimentSchema = z.object({
  sentiment: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  key_phrases: z.array(z.string()),
});

export async function classifySentiment(text: string) {
  const provider = getProvider("openai");
  
  return provider.completeStructured(
    [
      {
        role: "system",
        content: `Classify sentiment of corporate communications. Focus on strategic sentiment (growth, risk, uncertainty). Provide reasoning and key phrases that drove classification.`,
      },
      { role: "user", content: text },
    ],
    SentimentSchema,
  );
}
```

### Theme Identification

```typescript
// src/lib/ai/themes.ts
import { z } from "zod";
import { getProvider } from "@/lib/ai/provider";

const ThemeSchema = z.object({
  label: z.string().describe("Theme label, e.g., 'expansion', 'M&A'"),
  evidence: z.array(z.string()).describe("Supporting evidence snippets"),
});

const ThemeExtractionSchema = z.object({
  themes: z.array(ThemeSchema),
});

export async function identifyThemes(text: string) {
  const provider = getProvider("openai");
  
  const result = await provider.completeStructured(
    [
      {
        role: "system",
        content: `Detect strategic themes in corporate signals. Themes include: expansion, cost-cutting, innovation, M&A, regulatory, leadership changes, market entry/exit.`,
      },
      { role: "user", content: text },
    ],
    ThemeExtractionSchema,
  );
  
  return result.themes;
}
```

### Confidence Scoring

```typescript
// src/lib/ai/confidence.ts
import { z } from "zod";
import { getProvider } from "@/lib/ai/provider";

const ConfidenceSchema = z.object({
  score: z.number().min(0).max(1),
  factors: z.array(z.string()),
  risks: z.array(z.string()),
});

export async function scoreConfidence(
  facts: Array<{ text: string; confidence: number }>,
  themes: Array<{ label: string; evidence: string[] }>,
) {
  const provider = getProvider("openai");
  
  const context = `
Facts extracted:
${facts.map(f => `- ${f.text} (confidence: ${f.confidence})`).join("\n")}

Themes identified:
${themes.map(t => `- ${t.label}: ${t.evidence.join(", ")}`).join("\n")}
`;
  
  return provider.completeStructured(
    [
      {
        role: "system",
        content: `Score confidence in strategic inferences. Consider: evidence quality, source reliability, corroboration, specificity, and consistency.`,
      },
      { role: "user", content: context },
    ],
    ConfidenceSchema,
  );
}
```

## Quick Reference

### Signal Types

| Type | Examples | Indicators |
|------|----------|------------|
| Financial | Earnings, guidance, funding | Revenue, profit, loss, valuation |
| Operational | Product launches, updates | Release, feature, platform |
| Strategic | M&A, partnerships | Acquisition, merger, pivot |
| Cultural | Hiring, layoffs, policy | Remote, culture, restructure |

### Fact Extraction Checklist

- **Who**: Company, executives, partners
- **What**: Action, event, announcement
- **When**: Date, timeframe, quarter
- **Where**: Location, market, segment
- **Why**: Reason, motivation, context

### Confidence Factors

- Number of facts extracted (more = better)
- Source credibility (official filings > news > social)
- Corroboration (multiple sources confirm)
- Specificity (concrete details > vague claims)

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Sequential LLM calls without error handling | If stage 3/5 fails, all prior work lost | Wrap each stage in try/catch, log failures |
| No Zod schema for LLM output | Manual JSON parsing, no validation | Use `provider.completeStructured(messages, schema)` |
| No logging | Can't debug failures or track progress | Use centralized logger with signalId context |
| Monolithic analysis prompt | Unpredictable output, hard to debug | Break into stages with focused prompts |

## Related Skills

- **llm-abstraction** - LLM provider abstraction with structured outputs
- **data-modeling** - Zod schema design for analysis results
- **article-generation** - Transform analysis into news-style articles
