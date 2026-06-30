# RSS Scraper Data Quality Fix - Summary

## Problem
Many RSS feed signals were storing only short summaries (100-200 chars) instead of full article content. Example signal `cmquig48m000rnwlnorw0womd` had only 134 characters.

## Root Cause
The RSS scraper correctly handled `content:encoded` fields when present (e.g., Ars Technica with 1000-2000+ chars), but many feeds like TechCrunch, BBC, and NYT don't provide `content:encoded` at all - only `description` fields with brief summaries.

## Solution
Enhanced the RSS scraper with optional full article fetching:

### Changes Made

1. **Updated `src/lib/scraping/rss-scraper.ts`**
   - Added `fetchFullArticles` option to `scrapeFeed()` method
   - Implemented `enrichWithFullArticles()` to fetch articles with content < 500 chars
   - Added `extractArticleContent()` to extract HTML content from article pages
   - Preserves HTML formatting and links in extracted content

2. **Updated `src/lib/inngest/discovery.ts`**
   - Enabled `fetchFullArticles: true` in the discovery pipeline
   - Future RSS signals will automatically get full content

3. **Created re-enrichment script**
   - `scripts/re-enrich-rss-signals.ts` fetches full articles for existing signals
   - Successfully updated 26 out of 28 short signals

## Results

### Before Fix
- TechCrunch signals: 37-176 chars (just descriptions)
- Signal `cmquig48m000rnwlnorw0womd`: 134 chars

### After Fix
- TechCrunch signals: 2,720-22,852 chars (full articles)
- Signal `cmquig48m000rnwlnorw0womd`: 5,033 chars (37x improvement)
- 26 existing signals re-enriched with full content

### Examples of Improvements
- BBC articles: 82-140 chars → 14,000-26,000 chars
- NYT articles: 94-182 chars → 19,000-40,000 chars
- NVIDIA blog: 298-413 chars → 6,000-13,000 chars
- TechCrunch: 37-176 chars → 3,500-22,800 chars

## Technical Details

### Content Extraction Strategy
The scraper tries these selectors in order:
1. `[itemprop="articleBody"]` - Schema.org markup
2. `.entry-content`, `.post-content`, `.article-content` - Common CSS classes
3. `article`, `main` - Semantic HTML tags
4. Fallback to largest text block if no structured content found

### Rate Limiting
- Respects 1 request/second rate limit
- Parallel fetching with rate limiter
- Graceful error handling (failed fetches don't break the pipeline)

### Backward Compatibility
- `fetchFullArticles` is optional (defaults to false)
- Existing code continues to work without changes
- Only discovery pipeline enables the new feature

## Verification

Run the test script to verify the fix:
```bash
pnpm tsx scripts/test-rss-fix.ts
```

Run the re-enrichment script for existing signals:
```bash
pnpm tsx scripts/re-enrich-rss-signals.ts
```

## Future Considerations

1. **Storage**: Full articles use more database space. Monitor storage usage.
2. **Performance**: Fetching full articles adds latency to feed processing. Consider async enrichment.
3. **Legal**: Some sites may not allow full content scraping. Review robots.txt and terms of service.
4. **Deduplication**: Content hash now includes full article, reducing false duplicates.

## Files Modified
- `src/lib/scraping/rss-scraper.ts` - Added full article fetching
- `src/lib/inngest/discovery.ts` - Enabled full article fetching in pipeline
- `scripts/re-enrich-rss-signals.ts` - Re-enrichment script (new)
- `scripts/test-rss-fix.ts` - Test script (new)
