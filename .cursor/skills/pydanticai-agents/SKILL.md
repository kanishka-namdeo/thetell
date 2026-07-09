---
name: pydanticai-agents
description: Use when building LLM-powered features with structured outputs, implementing multi-provider LLM integration, or working with the TypeScript AI provider abstraction
---

# LLM Agent Patterns

## Overview

Build LLM-powered features using the **TypeScript AI provider abstraction** at `src/lib/ai/provider.ts`. This provides:

- **Type-safe structured outputs** via Zod schemas with automatic validation
- **Multi-provider support** through a unified `LLMProvider` interface (OpenAI, Anthropic)
- **Consistent logging** via the centralized Pino logger
- **Provider switching** without code changes

## When to Use

- Building any LLM-powered feature (fact extraction, sentiment analysis, theme detection)
- When you need structured, validated outputs from LLMs
- When you need to support multiple LLM providers without hardcoding
- When you need observability for LLM calls (handled by Pino structured logging + PipelineRun/PipelineLog models)
- When you need streaming responses to the frontend

## Core Patterns

### Provider Interface

```typescript
// src/lib/ai/provider.ts
import { z } from "zod";
import type { LLMMessage } from "./types";

export type ProviderName = "openai" | "anthropic";

export interface LLMProvider {
  completeStructured<T>(
    messages: LLMMessage[],
    schema: z.ZodSchema<T>,
    options?: { model?: string; temperature?: number }
  ): Promise<T>;
}
```

### Structured Output with Zod

Define output as Zod schemas. The provider parses the LLM's JSON response and validates it against the schema.

```typescript
import { z } from "zod";
import { getProvider } from "@/lib/ai/provider";

const SentimentSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

async function analyzeSentiment(text: string) {
  const provider = getProvider("openai");

  const result = await provider.completeStructured(
    [
      { role: "system", content: "Classify the sentiment of corporate communications." },
      { role: "user", content: text },
    ],
    SentimentSchema,
  );

  // result is typed as { sentiment: "positive" | "negative" | "neutral", confidence: number, reasoning: string }
  return result;
}
```

**Key points:**
- `getProvider("openai")` or `getProvider("anthropic")` selects the provider
- `completeStructured()` sends messages, parses JSON, validates with Zod
- The result is guaranteed to match the Zod schema — no manual JSON parsing
- Token usage is logged automatically

### Multi-Provider Support

Use the provider abstraction to switch providers without code changes.

```typescript
import { getProvider, type ProviderName } from "@/lib/ai/provider";

// Switch providers without code changes
function analyzeWithProvider(text: string, providerName: ProviderName) {
  const provider = getProvider(providerName);
  return provider.completeStructured(
    [
      { role: "system", content: "Analyze corporate signals." },
      { role: "user", content: text },
    ],
    AnalysisSchema,
  );
}

// Override model per-call
const provider = getProvider("openai");
const result = await provider.completeStructured(
  messages,
  schema,
  { model: "gpt-4o-mini", temperature: 0.1 },
);
```

**Key points:**
- `ProviderName` type: `"openai" | "anthropic"`
- Set default model via environment variables (`OPENAI_MODEL`, `ANTHROPIC_MODEL`)
- Override per-call with `options.model`
- Makes A/B testing and fallback strategies easy

### Fallback Models

Try primary provider, fallback to secondary on failure.

```typescript
import { getProvider, type ProviderName } from "@/lib/ai/provider";
import { logger } from "@/lib/logger";
import { z } from "zod";

async function runWithFallback<T>(
  messages: LLMMessage[],
  schema: z.ZodSchema<T>,
): Promise<T> {
  const providersToTry: ProviderName[] = ["openai", "anthropic"];

  for (const name of providersToTry) {
    try {
      const provider = getProvider(name);
      return await provider.completeStructured(messages, schema);
    } catch (error) {
      logger.warn("llm.fallback", { provider: name, error: String(error) });
      continue;
    }
  }

  throw new Error("All LLM providers failed");
}
```

## The Tell-Specific Patterns

### Fact Extraction

```typescript
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

async function extractFacts(text: string) {
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

### Sentiment Analysis

```typescript
const SentimentResultSchema = z.object({
  sentiment: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  key_phrases: z.array(z.string()),
});

async function analyzeSentiment(text: string) {
  const provider = getProvider("openai");

  return provider.completeStructured(
    [
      {
        role: "system",
        content: `Classify sentiment of corporate communications. Focus on strategic sentiment (growth, risk, uncertainty). Provide reasoning and key phrases that drove classification.`,
      },
      { role: "user", content: text },
    ],
    SentimentResultSchema,
  );
}
```

### Theme Detection

```typescript
const ThemeSchema = z.object({
  label: z.string().describe("Theme label, e.g., 'expansion', 'M&A'"),
  evidence: z.array(z.string()).describe("Supporting evidence snippets"),
});

const ThemeExtractionSchema = z.object({
  themes: z.array(ThemeSchema),
});

async function detectThemes(text: string) {
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
const ConfidenceSchema = z.object({
  score: z.number().min(0).max(1),
  factors: z.array(z.string()),
  risks: z.array(z.string()),
});

async function scoreConfidence(facts: any[], themes: any[]) {
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

### Article Writer

```typescript
const ArticleSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  body: z.string(),
  key_takeaways: z.array(z.string()).min(3).max(5),
});

async function writeArticle(analysis: any) {
  const provider = getProvider("openai");

  const result = await provider.completeStructured(
    [
      {
        role: "system",
        content: `Write news-style articles from analysis results. Use journalistic tone, cite sources, provide context. Structure: headline, summary, body, key takeaways.`,
      },
      {
        role: "user",
        content: `Write an article based on this analysis:\n\nCompany: ${analysis.companyName}\nFacts: ${analysis.facts}\nSentiment: ${analysis.sentiment}\nThemes: ${analysis.themes}\nConfidence: ${analysis.confidence}`,
      },
    ],
    ArticleSchema,
  );

  return result;
}
```

## Common Mistakes

### Mistake 1: Not Using Zod for Structured Output

**Bad:**
```typescript
const response = await fetch("/api/llm"); // Manual endpoint
const data = await response.json(); // Manual parsing, may fail
```

**Good:**
```typescript
const result = await provider.completeStructured(messages, MySchema);
// result is typed and validated
```

### Mistake 2: Hardcoding Provider

**Bad:**
```typescript
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const response = await client.chat.completions.create({ ... });
```

**Good:**
```typescript
const provider = getProvider("openai");
const result = await provider.completeStructured(messages, schema);
// Can switch to getProvider("anthropic") without code changes
```

### Mistake 3: Ignoring Rate Limits

```typescript
// Bad: No concurrency control
const results = await Promise.all(texts.map(t => extractFacts(t))); // Rapid fire!

// Good: Limit concurrency
const CONCURRENCY = 5;
async function mapWithLimit<T, R>(items: T[], fn: (item: T) => Promise<R>, limit: number): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}
```

## Quick Reference

| Pattern | Code |
|---------|------|
| **Get provider** | `getProvider("openai")` or `getProvider("anthropic")` |
| **Structured output** | `provider.completeStructured(messages, zodSchema)` |
| **Override model** | `provider.completeStructured(messages, schema, { model: "gpt-4o-mini" })` |
| **Message format** | `{ role: "system" \| "user" \| "assistant", content: string }` |
| **Fallback** | Loop over providers with try/catch |
| **Type definitions** | `src/lib/ai/types.ts` |
| **Provider implementation** | `src/lib/ai/provider.ts` |

## Related Skills

- **llm-abstraction** — Lower-level LLM provider abstraction
- **signal-analysis** — Analysis pipeline patterns (uses provider for LLM calls)
- **data-modeling** — Zod schema design (applies to structured output schemas)
