# Signal Misattribution Bug Fix Summary

## What Was Fixed

The bug that caused TechCrunch articles (like the Polymarket hack story) to be incorrectly attributed to Apple has been fixed.

## Changes Made

### 1. Company Resolution Function (`src/lib/inngest/discovery.ts`)
- Added `resolveCompanySlug()` function that maps feed registry slugs (e.g., "techcrunch") to database UUIDs
- Returns `null` if company doesn't exist, preventing invalid associations

### 2. Feed Processing Update (`src/lib/inngest/discovery.ts`)
- RSS feed processing now resolves company IDs before creating any signals
- If a company slug doesn't resolve to a valid UUID, the entire feed is skipped with clear logging
- Pipeline runs now log both the slug and resolved UUID for debugging

### 3. Signal Validation (`src/lib/inngest/discovery.ts`)
- Added validation in `processFeedItem()` to ensure companyId is a proper UUID format
- Added database existence check before creating signals
- Invalid or non-existent company IDs cause the signal to be skipped (not created)

### 4. Helper Functions (`src/lib/scraping/feed-registry.ts`)
- Added `getAllCompanySlugs()` and `hasFeedForSlug()` for validation and debugging

## How It Works Now

**Before (Broken):**
```
Feed Registry (slug: "techcrunch") → Signal (companyId: "techcrunch") → Defaults to Apple ❌
```

**After (Fixed):**
```
Feed Registry (slug: "techcrunch") 
  → resolveCompanySlug("techcrunch") 
  → null (company not found) 
  → Skip feed with warning ✅
```

## Prevention

Multiple layers of validation ensure this cannot happen again:
1. Pre-processing resolution (slug → UUID)
2. UUID format validation
3. Database existence check
4. Comprehensive error logging

## What Happens to TechCrunch Feeds Now

Since there is no company "TechCrunch" in the database, TechCrunch feeds will be **skipped** with a warning log:
```
discovery.rss_feed.skip.company_not_found: Company not found in database: TechCrunch (slug: techcrunch)
```

This is the correct behavior - we should not create signals with invalid company associations.

## Next Steps

To properly handle general tech news feeds:
1. Add TechCrunch as a company in the database if we want to track it as a source
2. Or implement entity extraction to dynamically associate articles with mentioned companies
3. Update feed registry to only include companies that exist in the database

## Files Modified

- `src/lib/inngest/discovery.ts` - Company resolution and validation logic
- `src/lib/scraping/feed-registry.ts` - Helper functions for validation
