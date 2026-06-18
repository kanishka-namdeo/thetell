---
name: data-modeling
description: Use when designing new data structures, creating Zod schemas for validation, defining TypeScript interfaces, designing Prisma models, or managing data transformations between layers
---

# Data Modeling

## Overview

Use **Zod schemas** for runtime validation and **TypeScript interfaces** for compile-time type safety. Layer models from raw to processed to published, with strict validation at each stage. Use **Prisma models** for database persistence.

## When to Use

- Creating any new data structure (Zod schemas, TypeScript types)
- Designing database schemas or API request/response schemas
- Defining Zod schemas for LLM structured output validation
- Transforming data between pipeline stages (scraping → analysis → API → frontend)
- When frontend and backend need to share type definitions

## Core Pattern: Layered Zod Schemas + TypeScript Types

### Before: Untyped Data (Problematic)

```typescript
// Bad: Any types, no structure
type Signal = any;

// Bad: No validation on raw data
function processSignal(data: any) {
  return {
    id: data.id,
    text: data.text,
    analysis: data.analysis,
    // No validation, no types, easy to miss fields
  };
}
```

### After: Layered Zod Schemas + TypeScript Types

```typescript
import { z } from "zod";

// --- Enums ---

export const SourceTypeEnum = z.enum([
  "NEWS", "FILING", "TRANSCRIPT", "SOCIAL", "BLOG", "JOB_POSTING",
]);
export type SourceType = z.infer<typeof SourceTypeEnum>;

export const SentimentEnum = z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]);
export type Sentiment = z.infer<typeof SentimentEnum>;

// --- Domain Models ---

export const FactSchema = z.object({
  text: z.string().describe("The fact statement"),
  category: z.enum(["financial", "strategic", "operational", "personnel", "market"]),
  source_sentence: z.string().describe("Original sentence from the signal"),
  confidence: z.number().min(0).max(1).describe("Confidence in this fact"),
});
export type Fact = z.infer<typeof FactSchema>;

export const AnalysisSchema = z.object({
  facts: z.array(FactSchema),
  sentiment: SentimentEnum,
  implications: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  analyzedAt: z.string().datetime(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const SignalSchema = z.object({
  id: z.string().uuid(),
  sourceUrl: z.string().url(),
  sourceType: SourceTypeEnum,
  rawContent: z.string(),
  scrapedAt: z.string().datetime(),
  analysis: AnalysisSchema.nullable().default(null),
});
export type Signal = z.infer<typeof SignalSchema>;

export const PublishedArticleSchema = z.object({
  id: z.string().uuid(),
  signalId: z.string().uuid(),
  headline: z.string(),
  leadParagraph: z.string(),
  body: z.string(),
  sources: z.array(z.string()),
  publishedAt: z.string().datetime(),
});
export type PublishedArticle = z.infer<typeof PublishedArticleSchema>;
```

## Zod for LLM Structured Output

Define Zod schemas to validate LLM outputs. Parse the LLM's JSON response through the schema to guarantee structure.

### Pattern

```typescript
import { z } from "zod";
import { getProvider } from "@/lib/ai/provider";

const FactExtractionSchema = z.object({
  facts: z.array(z.string()).describe("List of key facts extracted from the signal"),
  entities: z.array(z.string()).describe("Companies, people, products mentioned"),
  sentiment: z.enum(["positive", "negative", "neutral"]).describe("Overall sentiment"),
  confidence: z.number().min(0).max(1).describe("Confidence in extraction accuracy"),
});
type FactExtraction = z.infer<typeof FactExtractionSchema>;

async function extractFacts(text: string): Promise<FactExtraction> {
  const provider = getProvider("openai");
  const result = await provider.completeStructured(
    [
      { role: "system", content: "Extract key facts from corporate signals." },
      { role: "user", content: text },
    ],
    FactExtractionSchema,
  );
  return result; // Guaranteed to match FactExtractionSchema
}
```

### Key Principles

- **Every LLM call needs a Zod schema** — without it, you get raw strings with no type safety
- **Use `.describe()`** — descriptions guide the LLM on what to return
- **Use validation constraints** — `.min(0).max(1)` for ranges, `.min(1)` for arrays
- **Keep output schemas focused** — one schema per LLM call, not a catch-all
- **Nest schemas for complex outputs** — break large outputs into sub-schemas

### Common Output Schemas

```typescript
const SentimentResultSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().describe("Brief explanation of sentiment classification"),
  key_phrases: z.array(z.string()).describe("Phrases that drove sentiment"),
});

const ThemeResultSchema = z.object({
  themes: z.array(z.string()).describe("Strategic themes detected"),
  primary_theme: z.string().describe("Most prominent theme"),
  confidence: z.number().min(0).max(1),
});

const ConfidenceResultSchema = z.object({
  confidence_score: z.number().min(0).max(1),
  factors: z.array(z.string()).describe("Factors that influenced confidence"),
  risks: z.array(z.string()).describe("Risks or uncertainties"),
});
```

## Prisma Models

Prisma models define the database schema. Zod schemas validate data at the API boundary. Keep them in sync.

### Pattern

```prisma
// prisma/schema.prisma
model Signal {
  id          String    @id @default(uuid())
  sourceUrl   String    @map("source_url")
  sourceType  SourceType @map("source_type")
  rawContent  String    @map("raw_content")
  scrapedAt   DateTime  @default(now()) @map("scraped_at")
  companyId   String    @map("company_id")
  company     Company   @relation(fields: [companyId], references: [id])
  analysis    Analysis?

  @@map("signals")
}

model Analysis {
  id            String   @id @default(uuid())
  signalId      String   @unique @map("signal_id")
  signal        Signal   @relation(fields: [signalId], references: [id])
  facts         Json
  sentiment     Sentiment
  implications  String[]
  confidence    Float
  analyzedAt    DateTime @default(now()) @map("analyzed_at")

  @@map("analyses")
}
```

### Key Principles

- **Prisma models define persistence** — what goes into the database
- **Zod schemas define API boundaries** — what comes in/out of the API
- **TypeScript interfaces define in-memory types** — used throughout the app
- **Use `z.infer`** to derive TypeScript types from Zod schemas (single source of truth)
- **Keep naming consistent** — `sourceUrl` in TypeScript, `source_url` in Prisma (use `@map`)

## Cross-Layer Data Flow

Data flows through four layers: Prisma model → Zod validation → API response → frontend TypeScript. Each layer has its own type, with explicit transformations between layers.

### Flow Diagram

```
Prisma Model       Zod Schema         API Response         Frontend Type
(Prisma Client) →  (validation)   →   (NextResponse)  →   (TypeScript)

Signal (DB)        SignalSchema       { items, nextCursor }  Signal
- id: string       .parse(data)       JSON response           interface
- sourceUrl: string                                        - id: string
- rawContent: string                                       - sourceUrl: string
```

### Keeping Layers in Sync

- **Use `z.infer`** to derive TypeScript types from Zod schemas
- **Name models consistently** — `SignalSchema` (validation) → `Signal` (type)
- **Use the same field names** — `confidence` in Zod, `confidence` in TypeScript
- **Document transformations** — comment where data shape changes between layers

## Quick Reference

| Aspect | Rule |
|--------|------|
| **Model layering** | Raw → Processed → Published |
| **Validation** | Zod schemas on every API boundary |
| **LLM outputs** | `provider.completeStructured(messages, zodSchema)` |
| **Prisma models** | Define persistence, use `@map` for snake_case DB columns |
| **Type derivation** | `type Signal = z.infer<typeof SignalSchema>` |
| **Cross-layer sync** | Single Zod schema source, derive types with `z.infer` |
| **Enums** | `z.enum([...])` for finite sets (signal types, status) |
| **IDs** | UUID, auto-generated |
| **Timestamps** | UTC, `z.string().datetime()` |
| **Optionals** | Use `.nullable()` or `.optional()` for fields that may be absent |

## Common Mistakes

### Mistake 1: No validation

**Problem:** Garbage data flows through the pipeline.

```typescript
// Bad: No validation
interface Signal { url: string; text: string; }

// Good: Zod validation
const SignalSchema = z.object({
  sourceUrl: z.string().url("Invalid URL"),
  rawContent: z.string().min(1, "Must not be empty"),
});
```

### Mistake 2: Flat models

**Problem:** Hard to evolve, mixes concerns.

```typescript
// Bad: Everything in one schema
const SignalSchema = z.object({
  id: z.string(),
  sourceUrl: z.string(),
  rawContent: z.string(),
  facts: z.array(z.string()),
  sentiment: z.string(),
  headline: z.string(),
  body: z.string(),
});

// Good: Layered schemas
const AnalysisSchema = z.object({
  facts: z.array(FactSchema),
  sentiment: SentimentEnum,
  confidence: z.number().min(0).max(1),
});

const SignalSchema = z.object({
  id: z.string(),
  sourceUrl: z.string(),
  rawContent: z.string(),
  analysis: AnalysisSchema.nullable(),
});
```

### Mistake 3: Manual type sync

**Problem:** Backend and frontend types drift apart.

```typescript
// Good: Single source of truth with z.infer
const SignalResponseSchema = z.object({
  id: z.string().uuid(),
  sourceUrl: z.string().url(),
  confidence: z.number().min(0).max(1),
});
type SignalResponse = z.infer<typeof SignalResponseSchema>;
// Frontend imports the same schema or type
```

### Mistake 4: Using raw objects instead of schemas

**Problem:** No autocomplete, no validation, no documentation.

```typescript
// Bad: Raw objects
function process(data: any): any {
  return { result: data.text.toUpperCase() };
}

// Good: Zod schemas
const ProcessInputSchema = z.object({ text: z.string().min(1) });
const ProcessOutputSchema = z.object({ result: z.string() });

function process(data: z.infer<typeof ProcessInputSchema>): z.infer<typeof ProcessOutputSchema> {
  return { result: data.text.toUpperCase() };
}
```

### Mistake 5: Not defining Zod schema for LLM outputs

**Problem:** No type safety, manual JSON parsing.

```typescript
// Bad — returns raw string
const response = await provider.complete(messages);
const data = JSON.parse(response); // May fail, no validation

// Good — returns validated type
const result = await provider.completeStructured(messages, FactExtractionSchema);
// result is FactExtraction — type-safe, validated
```

## Tools

- **Zod** — Runtime validation and type inference
- **Prisma** — ORM for database models and migrations
- **TypeScript** — Compile-time type safety

## Related Skills

- **llm-abstraction** — LLM provider abstraction with Zod structured outputs
- **signal-analysis** — Analysis pipeline patterns
- **api-design** — Next.js Route Handler patterns with Zod validation
