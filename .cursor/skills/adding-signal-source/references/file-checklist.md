# File Checklist: Adding a Signal Source

Quick reference for every file that needs updating. Replace `NEW_SOURCE_TYPE` with your actual enum value.

## Required (8 files)

| # | File | What to Change | Line(s) |
|---|------|---------------|---------|
| 1 | `prisma/schema.prisma` | Add value to `SourceType` enum | 78-98 |
| 2 | `src/lib/ai/types.ts` | Add value to `SourceTypeEnum` Zod enum | 10-30 |
| 3 | `src/lib/scraping/new-source-scraper.ts` | **Create** — extend `BaseScraper`, implement scrape method | new file |
| 4 | `src/lib/scraping/registry.ts` | Add entry to `getAllScrapers()` array | 48-222 |
| 5 | `src/lib/inngest/discovery.ts` | Add import + results counter + `step.run()` block | 9-29, 54-77, after last step |
| 6 | `src/app/api/v1/signals/route.ts` | Add to `SignalCreateSchema` Zod enum + `createScraper()` switch | 29, 683-702 |
| 7 | `src/lib/ai/confidence.ts` | Add weight to `SOURCE_CREDIBILITY_WEIGHTS` | 14-34 |
| 8 | `src/lib/ai/hypothesis-generator.ts` | Add to hardcoded source type list in LLM prompt | 124 |

## Optional (4 files)

| # | File | When Needed | Line(s) |
|---|------|------------|---------|
| 9 | `src/lib/ai/hypothesis-generator.ts` | Source relevant to specific themes | 175-278 |
| 10 | `src/app/(public)/_components/feed-signal-card.tsx` | Source has special metadata (like SOCIAL) | 86-106 |
| 11 | `src/app/(public)/signals/[id]/signal-detail-content.tsx` | Source needs dedicated detail section | 222-274 |
| 12 | `src/lib/ai/agent/personas.ts` | Source fits a persona's analytical lens | 12, 45 |

## Verification Order

```
prisma migrate dev → typecheck → lint → build → manual POST test
```

## Key Code Patterns

**BaseScraper constructor**: `super(rateLimit?, timeout?, maxRetries?, cacheTtl?, skipRobots?)`

**createSignalFromScraper**: `await createSignalFromScraper(mapped, companyId, "SOURCE_TYPE", results, runId)`

**createPipelineRun**: `await createPipelineRun(companyId, "scraper-name", "SOURCE_TYPE")`

**Credibility weight range**: 0.40 (low) to 1.0 (high). Typical: FILING=1.0, NEWS=0.90, SOCIAL=0.50.
