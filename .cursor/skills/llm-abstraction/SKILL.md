---
name: llm-abstraction
description: Use when integrating LLM-powered features, supporting multiple LLM providers (OpenAI, Anthropic), implementing structured output parsing with Zod schemas, or working with the AI provider abstraction layer
---

# LLM Abstraction

## Overview

Use the **LLM provider abstraction** at `src/lib/ai/provider.ts` to interact with multiple LLM providers through a unified interface. It provides:

- **Multi-provider support** — OpenAI and Anthropic through a single `LLMProvider` interface
- **Zod-validated structured outputs** — `completeStructured()` guarantees typed results
- **Consistent logging** — token usage, latency, and errors via the centralized logger
- **Provider switching** — change providers without changing calling code

## When to Use

- Any LLM-powered feature (analysis, generation, extraction)
- When you need structured, validated outputs from LLMs
- When you need to support multiple LLM providers
- When you need token usage tracking
- When you need prompt construction for LLM calls

## Core Pattern: Provider Interface

### The LLMProvider Interface

```typescript
// src/lib/ai/provider.ts
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
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

### Usage

```typescript
import { getProvider } from "@/lib/ai/provider";
import { z } from "zod";

// Define output schema
const SentimentSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

// Get provider and call with structured output
const provider = getProvider("openai");
const result = await provider.completeStructured(
  [
    { role: "system", content: "Classify sentiment of corporate communications." },
    { role: "user", content: "Revenue grew 20% YoY with expanding margins..." },
  ],
  SentimentSchema,
  { temperature: 0.3 },
);

console.log(result.sentiment);   // "positive"
console.log(result.confidence);  // 0.85
```

**Key points:**
- `getProvider("openai")` or `getProvider("anthropic")` selects the provider
- `completeStructured()` sends messages, parses JSON response, validates with Zod
- The result is guaranteed to match the Zod schema — no manual JSON parsing
- Token usage is logged automatically via the centralized logger

### Multi-Provider Support

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

### Structured Outputs with Zod

```typescript
import { z } from "zod";

const FactExtractionSchema = z.object({
  facts: z.array(z.object({
    text: z.string(),
    category: z.enum(["financial", "strategic", "operational", "personnel"]),
    confidence: z.number().min(0).max(1),
  })),
  entities: z.array(z.string()),
  sentiment: z.enum(["positive", "negative", "neutral"]),
});

async function extractFacts(text: string) {
  const provider = getProvider("openai");
  return provider.completeStructured(
    [
      { role: "system", content: "Extract key facts from corporate signals." },
      { role: "user", content: text },
    ],
    FactExtractionSchema,
  );
  // Return type is inferred from the Zod schema
}
```

### Fallback Models

```typescript
import { getProvider, type ProviderName } from "@/lib/ai/provider";
import { logger } from "@/lib/logger";

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

## Prompt Construction

Build prompts as message arrays. Keep system prompts focused and user prompts data-driven.

```typescript
import type { LLMMessage } from "@/lib/ai/types";

function buildAnalysisMessages(text: string, signalType: string): LLMMessage[] {
  return [
    {
      role: "system",
      content: `You are a corporate intelligence analyst. Analyze the following ${signalType} signal. Extract key facts, classify sentiment, and identify strategic implications.`,
    },
    {
      role: "user",
      content: text,
    },
  ];
}
```

## Type Definitions

```typescript
// src/lib/ai/types.ts
import { z } from "zod";

export const MessageRoleEnum = z.enum(["system", "user", "assistant"]);
export type MessageRole = z.infer<typeof MessageRoleEnum>;

export const LLMMessageSchema = z.object({
  role: MessageRoleEnum,
  content: z.string(),
});
export type LLMMessage = z.infer<typeof LLMMessageSchema>;

// Analysis result types
export const SentimentResultSchema = z.object({
  sentiment: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]),
  confidence: z.number().min(0).max(1),
  key_phrases: z.array(z.string()).default([]),
});
export type SentimentResult = z.infer<typeof SentimentResultSchema>;

export const FactExtractionResultSchema = z.object({
  facts: z.array(FactSchema).default([]),
});
export type FactExtractionResult = z.infer<typeof FactExtractionResultSchema>;
```

## Common Mistakes

### Mistake 1: Not Using Zod for Structured Output

**Bad:**
```typescript
const response = await provider.complete(messages); // No such method
const data = JSON.parse(response); // Manual parsing, may fail
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
|---|---|
| **Get provider** | `getProvider("openai")` or `getProvider("anthropic")` |
| **Structured output** | `provider.completeStructured(messages, zodSchema)` |
| **Override model** | `provider.completeStructured(messages, schema, { model: "gpt-4o-mini" })` |
| **Message format** | `{ role: "system" \| "user" \| "assistant", content: string }` |
| **Fallback** | Loop over providers with try/catch |
| **Type definitions** | `src/lib/ai/types.ts` |
| **Provider implementation** | `src/lib/ai/provider.ts` |

## Related Skills

- **signal-analysis** — Analysis pipeline patterns (uses provider for LLM calls)
- **data-modeling** — Zod schema design (applies to structured output schemas)
- **article-generation** — Article generation from analysis results
