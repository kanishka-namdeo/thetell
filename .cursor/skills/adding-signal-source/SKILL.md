---
name: adding-signal-source
description: Add a new signal source type to The Tell pipeline. Use when the user asks to track, integrate, add, or monitor a new data source, platform, or signal type (e.g., "add Meta tracking", "integrate LinkedIn signals", "track SEC whistleblower filings", "we want to monitor Glassdoor reviews").
---

# Adding a Signal Source

## Overview

Adding a new signal source requires updating 10 files across 7 layers. Missing any required file causes silent failures — the scraper may work but signals get default confidence weights, or the hypothesis generator won't suggest the new source. This skill provides the exact checklist and code patterns.

## Global Constraints

- Complete ALL required phases (1-5) before optional phases (6)
- Run `pnpm run typecheck` after Phase 1 — it will surface every file still missing the new enum value
- Use `SCREAMING_SNAKE_CASE` for the new source type name (e.g., `SOCIAL`, `JOB_POSTING`, `TECH_SIGNAL`)
- The Prisma enum and Zod enum MUST stay in sync — add the value to both in Phase 1

## Phase 1: Database + Types

### 1a. Prisma Schema

Add the new value to the `SourceType` enum in `prisma/schema.prisma` (line 78):

```prisma
enum SourceType {
  NEWS
  FILING
  // ... existing values ...
  LOBBYING
  NEW_SOURCE_TYPE  // <-- add here
}
```

Run `pnpm prisma migrate dev --name add-new-source-type` to generate and apply the migration.

### 1b. Zod Type Enum

Add the same value to `SourceTypeEnum` in `src/lib/ai/types.ts` (line 10):

```typescript
export const SourceTypeEnum = z.enum([
  "NEWS",
  "FILING",
  // ... existing values ...
  "LOBBYING",
  "NEW_SOURCE_TYPE",  // <-- add here
]);
```

**Checkpoint**: Run `pnpm run typecheck`. Every file that references `SourceType` and is missing the new value will error. Fix each one in the following phases.

## Phase 2: Scraper Implementation

Create `src/lib/scraping/new-source-scraper.ts`. Extend `BaseScraper`:

```typescript
// src/lib/scraping/new-source-scraper.ts
import { BaseScraper } from "./base-scraper";
import { logger } from "@/lib/logger";

export interface NewSourceSignal {
  url: string;
  title: string;
  description: string;
  publishedAt: Date | null;
}

export class NewSourceScraper extends BaseScraper {
  constructor() {
    // Args: rateLimit(req/s), timeout(ms), maxRetries, cacheTtl(s), skipRobots
    super(1.0, 30000, 3, 86400, false);
  }

  async scrape(companyIdentifier: string): Promise<NewSourceSignal[]> {
    // Use this.fetch(url) for rate-limited, cached, retry-safe HTTP
    // Use this.cache.get(key) / this.cache.set(key, value) for TTL caching
    // Use this.validateUrl(url) for SSRF protection
    // Return array of signal objects
  }
}
```

Key `BaseScraper` methods available via `this`:
- `this.fetch(url): Promise<string | null>` — rate-limited, cached, retry-safe HTTP
- `this.validateUrl(url): boolean` — SSRF protection (http/https only)
- `this.cache.get(key)` / `this.cache.set(key, value, ttl?)` — TTL cache backed by PostgreSQL

## Phase 3: Registration + Discovery

### 3a. Scraper Registry

Add the scraper to `getAllScrapers()` in `src/lib/scraping/registry.ts`:

```typescript
// src/lib/scraping/registry.ts
import { NewSourceScraper } from "./new-source-scraper";
// ... existing imports ...

export function getAllScrapers() {
  return [
    // ... existing scrapers ...
    {
      scraper: new NewSourceScraper(),
      enabled: true,  // or !!process.env.NEW_SOURCE_API_KEY if it needs a key
      config: {},
      // or: config: { apiKey: process.env.NEW_SOURCE_API_KEY },
    },
  ];
}
```

### 3b. Discovery Step

Add a new `step.run()` block in `src/lib/inngest/discovery.ts`. Follow this pattern:

```typescript
// src/lib/inngest/discovery.ts

// 1. Add import at top of file (line ~9-29):
import { NewSourceScraper } from "@/lib/scraping/new-source-scraper";

// 2. Add counter to results object (line ~54-77):
const results = {
  // ... existing counters ...
  newSourceProcessed: 0,  // <-- add here
  signalsCreated: 0,
  duplicatesSkipped: 0,
  errors: [] as string[],
};

// 3. Add step.run() block (after existing scraper steps):
await step.run("process-new-source", async () => {
  const scraper = new NewSourceScraper();
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, websiteUrl: true },
  });

  for (const company of companies) {
    let runId: string | null = null;
    let runSignalsCreated = 0;
    let runDuplicatesSkipped = 0;

    try {
      runId = await createPipelineRun(company.id, "new-source", "NEW_SOURCE_TYPE");

      const signals = await scraper.scrape(company.name);
      await addPipelineLog(runId, "info", `Found ${signals.length} signals`);

      for (const signal of signals.slice(0, 10)) {
        const mapped = {
          sourceUrl: signal.url,
          title: signal.title,
          rawContent: signal.description,
          publishedAt: signal.publishedAt,
        };

        const beforeCreated = results.signalsCreated;
        const beforeDuplicates = results.duplicatesSkipped;

        await createSignalFromScraper(
          mapped, company.id, "NEW_SOURCE_TYPE", results, runId
        );

        runSignalsCreated += results.signalsCreated - beforeCreated;
        runDuplicatesSkipped += results.duplicatesSkipped - beforeDuplicates;
      }

      results.newSourceProcessed++;
      await completePipelineRun(runId, runSignalsCreated, runDuplicatesSkipped);
    } catch (error) {
      log.error("discovery.new_source.error", {
        companyName: company.name,
        error: String(error),
      });
      if (runId) await failPipelineRun(runId, String(error));
    }
  }
});
```

## Phase 4: API Route

Update `src/app/api/v1/signals/route.ts` in two places:

### 4a. Zod Schema (line 29)

Add the new source type to the `SignalCreateSchema` enum:

```typescript
const SignalCreateSchema = z.object({
  sourceUrl: z.string().url("Invalid source URL"),
  sourceType: z.enum([
    "NEWS", "FILING", "TRANSCRIPT", "SOCIAL", "BLOG", "JOB_POSTING", "RSS",
    "NEW_SOURCE_TYPE",  // <-- add here
  ], { error: "Invalid source type" }),
  // ... rest of schema
});
```

### 4b. createScraper() Switch (line 683)

Add a case to the `createScraper()` function:

```typescript
function createScraper(sourceType: SourceType): ScraperInstance | null {
  switch (sourceType) {
    case "NEWS":
      return new NewsScraper();
    // ... existing cases ...
    case "NEW_SOURCE_TYPE":
      return new NewSourceScraper();  // <-- add import at top of file
    default:
      return null;
  }
}
```

## Phase 5: AI Layer

### 5a. Confidence Weights

Add credibility weight to `SOURCE_CREDIBILITY_WEIGHTS` in `src/lib/ai/confidence.ts` (line 14):

```typescript
const SOURCE_CREDIBILITY_WEIGHTS: Record<SourceType, number> = {
  FILING: 1.0,
  TRANSCRIPT: 0.95,
  // ... existing weights ...
  SOCIAL: 0.50,
  NEW_SOURCE_TYPE: 0.65,  // <-- add here (0.40-1.0 range)
};
```

Weight guide: FILING=1.0, NEWS=0.90, BLOG=0.80, SOCIAL=0.50. Choose based on source reliability.

### 5b. Hypothesis Generator Prompt

Add the new source type to the hardcoded enum list in the LLM prompt at `src/lib/ai/hypothesis-generator.ts` line 124:

```typescript
content: `...
- sourceWeights should list the source types most likely to provide evidence
  (use enum values: NEWS, FILING, TRANSCRIPT, SOCIAL, BLOG, JOB_POSTING,
  RSS, PATENT, LITIGATION, FDA, CONTRACT, TECH_SIGNAL, WEB_ARCHIVE,
  LEGISLATION, ACADEMIC, PODCAST, CONFERENCE, PRESS_RELEASE, LOBBYING,
  NEW_SOURCE_TYPE)
...`,
```

### 5c. Hypothesis Fallback Weights (Optional)

If the new source type is relevant to specific themes, add it to `inferSourceWeights()` in the same file (line 175). For example, if it's relevant to "financial" themes:

```typescript
if (lower.includes("financial") || lower.includes("revenue")) {
  return [
    { source: "FILING", weight: 0.9 },
    { source: "NEW_SOURCE_TYPE", weight: 0.7 },  // <-- add if relevant
    { source: "TRANSCRIPT", weight: 0.8 },
  ];
}
```

## Phase 6: Frontend (Optional)

Only needed if the new source type has special metadata (like SOCIAL has engagement/subreddit).

### 6a. Feed Card

In `src/app/(public)/_components/feed-signal-card.tsx`, add conditional rendering after the SOCIAL block (line 86-106):

```typescript
{signal.sourceType === "NEW_SOURCE_TYPE" && signal.metadata?.someField && (
  <Metadata className="text-xs text-muted-foreground">
    {signal.metadata.someField}
  </Metadata>
)}
```

### 6b. Signal Detail Page

In `src/app/(public)/signals/[id]/signal-detail-content.tsx`, add a conditional block for the new source type's metadata display.

### 6c. Persona Source Preferences (Optional)

In `src/lib/ai/agent/personas.ts`, add the new source type to the relevant persona's `sourcePreferences` array if it fits that persona's analytical lens.

## Phase 7: Verification

Run in order:

1. `pnpm prisma migrate dev` — confirm migration applies
2. `pnpm run typecheck` — zero errors
3. `pnpm run lint` — zero warnings
4. `pnpm run build` — builds successfully
5. Manual test: POST to `/api/v1/signals` with the new `sourceType`

## Human Checkpoints

- Ask before setting credibility weight above 0.80 or below 0.40 — these values affect analysis quality and cross-signal debate weighting
- Ask before adding a new source type to persona `sourcePreferences` — this affects which persona is recommended for analyzing the signal

## Guardrails

| Gotcha | What Happens | Fix |
|--------|-------------|-----|
| Forgot hypothesis prompt string | LLM won't suggest new source for hypothesis-driven collection | Phase 5b |
| Prisma/Zod enum mismatch | TypeScript errors or runtime validation failures | Phase 1 — add to both |
| Missing discovery results counter | Summary log shows 0 for new source | Phase 3b — add `newSourceProcessed` |
| Missing confidence weight | New source defaults to 0.5 weight | Phase 5a |
| Forgot createScraper() case | POST /api/v1/signals returns 400 for new type | Phase 4b |
| Skipped registry | `getEnabledScrapers()` won't include new scraper | Phase 3a |

## Quick Reference

See `references/file-checklist.md` for the complete file inventory with line numbers.
