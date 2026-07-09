# Control Center CTA Backend Changes Summary

This document summarizes the backend changes implemented to support three Control Center CTA improvements.

## Task 1: Discovery Scrape-Only Flag

### Changes Made

**File: `src/lib/inngest/signal-discovery.ts`**
- Added `scrapeOnly?: boolean` parameter to `DiscoveryEvent` interface (line 57)
- Updated main function to extract and pass `scrapeOnly` flag (line 219)
- Modified `processFeedItem` function signature to accept `scrapeOnly: boolean = false` parameter (line 2240)
- Modified `processFiling` function signature to accept `scrapeOnly: boolean = false` parameter (line 2423)
- Modified `createSignalFromScraper` function signature to accept `scrapeOnly: boolean = false` parameter (line 2552)
- Wrapped all 6 `inngest.send({ name: "signal/analysis.requested" })` calls with `if (!scrapeOnly)` conditionals:
  - 2 calls in `processFeedItem` (lines 2360, 2408)
  - 2 calls in `processFiling` (lines 2491, 2537)
  - 2 calls in `createSignalFromScraper` (lines 2638, 2689)
- Updated all 25+ call sites throughout the file to pass the `scrapeOnly` parameter

**File: `src/app/api/v1/admin/discovery/run/route.ts`**
- Updated POST handler to accept `Request` parameter (line 6)
- Added URL parsing to extract `scrapeOnly` query parameter (line 25)
- Passed `scrapeOnly` in the Inngest event data along with required fields (lines 34-42)

### Behavior
When `scrapeOnly=true` is passed:
- Signals are still created in the database
- Embeddings are still generated and stored
- Content validation and deduplication still occur
- **Only the analysis trigger is skipped** - no `signal/analysis.requested` event is sent

## Task 2: Correlation Recent-Only Flag

### Changes Made

**File: `src/lib/inngest/correlation.ts`**
- Updated main function to extract `recentOnly` from event data (line 352)
- Modified analysis loading logic to use 24-hour window when `recentOnly=true` (lines 359-365)
- Changed from hardcoded 7-day window to dynamic cutoff based on flag

**File: `src/app/api/v1/admin/correlation/run/route.ts`**
- Updated POST handler to accept `Request` parameter (line 6)
- Added URL parsing to extract `recentOnly` query parameter (line 25)
- Passed `recentOnly` in the Inngest event data (line 38)

### Behavior
When `recentOnly=true` is passed:
- Correlation engine only processes analyses from the last 24 hours (instead of 7 days)
- Useful for testing with recent data or focusing on very recent signals
- All other correlation logic remains unchanged

## Task 3: Articles Recent-Only Flag

### Changes Made

**File: `src/lib/inngest/articles.ts`**
- Made `companyId`, `analysisIds`, `agentPersona`, `authorId`, and `status` optional in event data type (lines 36-42)
- Added `recentOnly?: boolean` to event data type (line 42)
- Implemented new code path when `companyId` or `analysisIds` are not provided (lines 52-145):
  - Queries recent analyses based on `recentOnly` flag (24h vs 7 days)
  - Groups analyses by company
  - Generates articles for each company separately
  - Returns count of articles generated
- Updated original code path to use `targetCompanyId` and `targetAnalysisIds` variables (lines 147-236)
- Fixed all TypeScript type errors related to optional parameters

**File: `src/app/api/v1/admin/articles/generate/route.ts`**
- Updated POST handler to accept `Request` parameter (line 6)
- Added URL parsing to extract `recentOnly` query parameter (line 25)
- Passed `recentOnly` in the Inngest event data (line 41)

### Behavior
When called from Control Center (no `companyId`/`analysisIds`):
- Automatically queries recent analyses
- If `recentOnly=true`: only processes analyses from last 24 hours
- If `recentOnly=false`: processes analyses from last 7 days
- Groups by company and generates articles for each
- Returns count of articles generated

When called with specific `companyId` and `analysisIds`:
- Original behavior preserved
- Generates article for the specific analyses provided

## Testing Recommendations

1. **Discovery scrapeOnly**: Trigger discovery with `?scrapeOnly=true` and verify signals are created but no analysis jobs are triggered
2. **Correlation recentOnly**: Trigger correlation with `?recentOnly=true` and verify only recent analyses are processed
3. **Articles recentOnly**: Trigger article generation with `?recentOnly=true` and verify only recent analyses get articles

## Type Safety

All changes pass TypeScript type checking with `pnpm run typecheck`.

## Backward Compatibility

All changes are backward compatible:
- New parameters are optional with sensible defaults
- Existing API calls without query parameters work as before
- No breaking changes to existing functionality
