# Signal Data Quality Fixes - Implementation Summary

**Date:** June 25, 2026  
**Issues Addressed:** From SIGNAL_DATA_QUALITY_LLM_VERIFICATION_REPORT.md

## Issues Fixed

### 1. ✅ Future-Dated Publications
**Problem:** All 5 signals had publication dates in the future (June 2026), undermining credibility.

**Solution:**
- Created `src/lib/scraping/signal-validator.ts` with date validation logic
- Integrated validator into `src/lib/inngest/discovery.ts` to reject future dates at ingestion
- Cleanup script fixed existing signals by setting `publishedAt` to `scrapedAt` when date was in the future

**Result:** 0 signals with future dates (already fixed during cleanup run)

---

### 2. ✅ Missing Author Attribution
**Problem:** No author attribution, source URLs, or institutional affiliations.

**Solution:**
- Updated `src/lib/scraping/rss-scraper.ts` to extract author from:
  - `dc:creator` (Dublin Core)
  - `author` tag
  - `atom:author atom:name` (Atom feeds)
- Created cleanup script to fetch original URLs and extract authors from HTML meta tags
- Integrated author extraction into discovery pipeline

**Result:** 11 blog signals now have authors (e.g., "Waldek Mastykarz", "Paul Nyhan", "Brendan Burns")

---

### 3. ✅ Missing Metadata (Site Name / Institutional Affiliation)
**Problem:** No institutional affiliations or publication venue information.

**Solution:**
- Cleanup script fetches original URLs and extracts site names from:
  - `og:site_name` meta tag
  - `application-name` meta tag
  - `.site-title` / `.site-name` elements
- Stores metadata as JSON in `Signal.metadata` field

**Result:** 11 blog signals now have metadata with site names (e.g., "Microsoft for Developers", "NVIDIA Blog", "The Official Microsoft Blog")

---

### 4. ✅ Content Extraction Issues (HTML Entities)
**Problem:** Content contained HTML entities like `&#8217;` instead of proper characters.

**Solution:**
- Created `cleanHtmlEntities()` function in cleanup script
- Decodes common HTML entities:
  - `&#8217;` → `'`
  - `&#8220;` / `&#8221;` → `"`
  - `&#8211;` / `&#8212;` → `–` / `—`
  - `&amp;` → `&`
  - `&lt;` / `&gt;` → `<` / `>`
  - And more

**Result:** 10 signals had HTML entities cleaned

---

### 5. ⚠️ Truncated Content Detection
**Problem:** Multiple signals had truncated text ending mid-sentence.

**Solution:**
- Cleanup script detects truncation by checking if content ends with proper punctuation
- Flags signals that don't end with `.`, `!`, `?`, `)`, `]`, `"`, `'`, etc.
- **Note:** This is a detection/warning system, not automatic fixing. Truncated content requires re-scraping or manual intervention.

**Result:** 8 signals flagged as potentially truncated (mostly Tesla/AMD press releases with incomplete descriptions)

---

## Files Created/Modified

### New Files
1. **`src/lib/scraping/signal-validator.ts`**
   - Validates and cleans signal data before saving
   - Checks for future dates, missing authors, truncated content
   - Cleans HTML entities
   - Returns validation result with issues and cleaned data

2. **`scripts/cleanup-signal-data.ts`**
   - One-time cleanup script for existing signals
   - Fixes future dates, adds missing authors/metadata, cleans HTML entities
   - Detects truncated content

### Modified Files
1. **`src/lib/scraping/rss-scraper.ts`**
   - Added `author?: string` field to `FeedItem` interface
   - Updated `parseRss2()` to extract author from `dc:creator`, `author`, `atom:author`
   - Updated `parseAtom()` to extract author from `author name`, `atom:author atom:name`

2. **`src/lib/inngest/discovery.ts`**
   - Imported `validateAndCleanSignal` from signal-validator
   - Updated `processFeedItem()` to validate and clean RSS feed items
   - Updated `createSignalFromScraper()` to validate and clean all scraper signals
   - Passes cleaned data (content, publishedAt, author) to Prisma create calls

---

## Verification

### Before Cleanup
```
Signal: "When the model has never seen your code"
- author: (empty)
- metadata: (empty)
- rawContent: "The series covers what you can and can&#8217;t control..."
```

### After Cleanup
```
Signal: "When the model has never seen your code"
- author: "Waldek Mastykarz"
- metadata: {"siteName": "Microsoft for Developers", ...}
- rawContent: "The series covers what you can and can't control..."
```

---

## Impact on Future Signal Ingestion

All new signals will now be:
1. ✅ Validated for future dates (rejected or set to scrapedAt)
2. ✅ Extracted with author information from RSS feeds
3. ✅ Cleaned of HTML entities automatically
4. ✅ Checked for truncation (warnings logged)

The validator runs on every signal creation in the discovery pipeline, ensuring data quality going forward.

---

## Remaining Issues (Not Fixed by Scraper Changes)

### 1. Lack of Empirical Evidence
**Why not fixable via scrapers:** The scrapers correctly capture content—the problem is that source material itself lacks citations, metrics, or data. This requires LLM-based evidence scoring or editorial judgment.

### 2. Strategic Bias / Subtext Detection
**Why not fixable via scrapers:** Detecting "narrative weapons" and hidden agendas requires LLM inference (the Analyst/Gossip Girl dual-agent system). Scrapers cannot determine intent.

---

## Recommendations

1. **Re-scrape truncated signals:** The 8 flagged signals (Tesla/AMD press releases) should be re-scraped with improved extractors or manually reviewed.

2. **Monitor validation logs:** The validator logs warnings for truncation and missing authors. Monitor these to identify scraper improvements.

3. **Extend metadata extraction:** Consider extracting additional metadata like:
   - Publication date from HTML (if missing from RSS)
   - Categories/tags
   - Featured images
   - Reading time estimates

4. **Implement content completeness checks:** Add minimum content length requirements (e.g., reject signals < 100 characters).

---

## Cleanup Script Usage

To run the cleanup script again (e.g., after adding more signals):

```bash
pnpm tsx scripts/cleanup-signal-data.ts
```

The script is idempotent and safe to run multiple times.

---

**Summary:** Fixed 3 major data quality issues (future dates, missing authors, missing metadata) and cleaned HTML entities in 10 signals. Integrated validation into the ingestion pipeline to prevent future issues.
