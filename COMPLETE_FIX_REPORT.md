# Signal Misattribution Bug - Complete Fix Report

## Summary

**Issue**: TechCrunch articles were incorrectly attributed to Apple due to a company ID mapping bug in the discovery pipeline.

**Status**: ✅ **FIXED** - Both the code bug and existing data have been corrected.

## What Was Done

### 1. Code Fix (Prevention)
Fixed the root cause in the discovery pipeline to prevent future misattribution.

**Files Modified:**
- `src/lib/inngest/discovery.ts` - Added company resolution and validation
- `src/lib/scraping/feed-registry.ts` - Added helper functions

**Key Changes:**
- Added `resolveCompanySlug()` function to map feed registry slugs to database UUIDs
- Updated RSS feed processing to resolve company IDs before signal creation
- Added validation in `processFeedItem()` to reject invalid company IDs
- Added comprehensive logging for debugging

### 2. Data Cleanup (Correction)
Deleted 4 misattributed TechCrunch signals that were incorrectly assigned to Apple:

1. **"Polymarket says hackers stole users' funds"** - About Polymarket, not Apple
2. **"YouTube Shorts are getting even shorter..."** - About YouTube/Google, not Apple
3. **"Patronus AI lands $50M..."** - About Patronus AI, not Apple
4. **"The White House is asking OpenAI to slow roll..."** - About OpenAI, not Apple

**Kept (correct):**
- **"Xbox follows Apple with price increases"** - This IS about Apple

## How the Fix Works

### Before (Broken)
```
Feed Registry (slug: "techcrunch")
  → processFeedItem() with slug
  → Signal created with companyId: "techcrunch"
  → System defaults to Apple ❌
```

### After (Fixed)
```
Feed Registry (slug: "techcrunch")
  → resolveCompanySlug("techcrunch")
  → Returns null (company not found)
  → Feed skipped with warning
  → No signal created ✅
```

## Verification

After the fix:
- ✅ Only 1 TechCrunch signal remains assigned to Apple
- ✅ That signal is correctly about Apple ("Xbox follows Apple with price increases")
- ✅ 0 misattributed signals remain in the database
- ✅ Future TechCrunch feeds will be skipped (not misattributed)

## Prevention Layers

The fix includes multiple validation layers to prevent recurrence:

1. **Pre-processing resolution**: Company slugs resolved to UUIDs before any processing
2. **UUID format validation**: Ensures only valid UUID format is accepted
3. **Database existence check**: Verifies company exists before signal creation
4. **Comprehensive logging**: All validation failures logged with full context

## Next Steps

### Immediate (Recommended)
1. Monitor discovery pipeline logs for `discovery.rss_feed.skip.company_not_found` warnings
2. Verify no new signals are created with invalid company associations
3. Consider adding TechCrunch as a company if we want to track it as a news source

### Long-term
1. Implement entity extraction to dynamically associate articles with mentioned companies
2. Update feed registry to only include companies that exist in the database
3. Add automated tests for company resolution logic

## Technical Details

### Root Cause
The feed registry used string slugs (e.g., "techcrunch", "apple") as company IDs, but the database uses UUIDs. When the discovery pipeline processed feeds from the hardcoded registry, it passed these slugs directly to signal creation. Since there was no company with ID "techcrunch", the system incorrectly associated these signals with Apple.

### Solution
The fix adds a resolution layer that maps slugs to UUIDs before any signal creation. If a slug doesn't resolve to a valid company, the feed is skipped entirely, preventing any invalid associations.

---

**Date**: June 26, 2026
**Fixed by**: Agent
**Verification**: All misattributed signals deleted, code fix deployed
