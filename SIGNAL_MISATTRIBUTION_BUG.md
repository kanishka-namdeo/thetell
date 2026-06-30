# Signal Misattribution Bug Analysis

## Issue Summary

The Polymarket article from TechCrunch (`https://techcrunch.com/2026/06/25/polymarket-says-hackers-stole-users-funds/`) was incorrectly captured and attributed to **Apple Inc.** instead of being associated with TechCrunch as a general tech news source.

## Root Cause

The bug is in the **feed registry company ID mapping** during the discovery pipeline.

### How It Works (Currently)

1. **Feed Registry** (`src/lib/scraping/feed-registry.ts`):
   - Contains hardcoded feeds for 100+ companies
   - Each feed entry has a `companyId` field that is a **slug** (e.g., "apple", "techcrunch", "microsoft")
   - Example: TechCrunch feed has `companyId: "techcrunch"`

2. **Discovery Pipeline** (`src/lib/inngest/discovery.ts`, line 100-101):
   ```typescript
   const dbFeeds = await getAllFeedsFromDB();
   const feeds = dbFeeds.length > 0 ? dbFeeds : getAllFeeds();
   ```
   - Tries to get feeds from database first (DB-backed feeds use actual company UUIDs)
   - Falls back to hardcoded registry if DB is empty (hardcoded registry uses slug-based IDs)

3. **Signal Creation** (`src/lib/inngest/discovery.ts`, line 1414):
   ```typescript
   const signal = await prisma.signal.create({
     data: {
       companyId, // ← This is the slug from feed registry, not a UUID
       // ...
     },
   });
   ```

### The Problem

**There is no company with ID "techcrunch" in the database.** The database only has companies with UUID-like IDs:
- Apple Inc.: `cmqt4tfgj00019glnzzgopw14`
- Microsoft: `cmqt4tfhc00059gln17kg2epr`
- etc.

When the discovery pipeline processes the TechCrunch feed:
1. It gets `companyFeed.companyId = "techcrunch"` from the hardcoded registry
2. It passes this slug directly to `processFeedItem()`
3. `processFeedItem()` creates a signal with `companyId: "techcrunch"`
4. **Prisma silently accepts this invalid foreign key** (or it fails validation and defaults to the first company)

### Evidence

From database queries:

```
Signal with companyId "techcrunch": null

=== SAMPLE SIGNAL COMPANY IDS ===
CompanyID: cmqt4tfgj00019glnzzgopw14, Count: 20  ← All signals are Apple's ID

=== APPLE TECHCRUNCH SIGNALS ===
Count: 5
1. "The White House is asking OpenAI to slow roll..."
2. "YouTube Shorts are getting even shorter..."
3. "Patronus AI lands $50M..."
4. "Polymarket says hackers stole users' funds"  ← The problematic signal
5. "Xbox follows Apple with price increases"
```

All TechCrunch articles are being assigned to Apple because:
- The feed registry's "techcrunch" slug doesn't match any company
- The system appears to default to the first available company (Apple) when the slug doesn't resolve

## Impact

**All signals from general tech news feeds** (TechCrunch, The Information, Stratechery) are being incorrectly attributed to Apple instead of being properly categorized as general tech news or associated with the companies they're actually about.

This affects:
- Signal attribution accuracy
- Company-specific analysis (Apple's signals include irrelevant tech news)
- Cross-signal correlation (false connections between Apple and unrelated companies)
- User trust in the platform's intelligence

## Solution

### Option 1: Create a "TechCrunch" Company (Quick Fix)
Add a company entry for TechCrunch and other news sources:
```typescript
// In Prisma seed or migration
{
  id: 'techcrunch', // or a UUID
  name: 'TechCrunch',
  slug: 'techcrunch',
  // ...
}
```

### Option 2: Slug-to-UUID Mapping (Proper Fix)
Modify the discovery pipeline to resolve feed registry slugs to database company UUIDs:

```typescript
// In discovery.ts, before processing feeds
async function resolveCompanyId(slug: string): Promise<string | null> {
  const company = await prisma.company.findFirst({
    where: { slug },
    select: { id: true },
  });
  return company?.id || null;
}

// Then in the feed processing loop:
const resolvedCompanyId = await resolveCompanyId(companyFeed.companyId);
if (!resolvedCompanyId) {
  log.warn("Skipping feed: company not found", { slug: companyFeed.companyId });
  continue;
}
// Use resolvedCompanyId instead of companyFeed.companyId
```

### Option 3: General News Feed Handling (Best Practice)
Treat general news feeds differently:
1. Create signals without a specific company association (`companyId: null`)
2. Use NLP/entity extraction to identify mentioned companies
3. Create company-signal associations dynamically based on content analysis

## Files Affected

- `src/lib/scraping/feed-registry.ts` - Feed definitions use slugs
- `src/lib/inngest/discovery.ts` - Discovery pipeline uses slugs directly
- `prisma/schema.prisma` - Company model uses UUIDs

## Verification

After fixing, verify:
1. TechCrunch articles are not assigned to Apple
2. Each feed's signals are associated with the correct company
3. No signals have invalid companyId values
4. Pipeline runs show correct company associations in logs
