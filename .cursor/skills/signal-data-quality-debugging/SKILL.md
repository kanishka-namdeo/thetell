---
name: signal-data-quality-debugging
description: Debug and fix signal data quality issues in the scraping pipeline. Use when investigating truncated content, missing metadata, future dates, HTML entities, or when signal quality scores are low. Guides through diagnosis, scraper improvements, and re-scraping workflows.
---

# Signal Data Quality Debugging

Systematic approach to diagnosing and fixing data quality issues in scraped signals.

## Common Issues

| Issue | Symptoms | Root Cause |
|-------|----------|------------|
| **Truncated content** | Content ends mid-sentence, < 500 chars | RSS feed descriptions limited, JS-rendered pages |
| **Missing authors** | `author` field null/empty | Scraper doesn't extract author metadata |
| **Missing metadata** | No site name, publication venue | Scraper doesn't extract `og:site_name` |
| **Future dates** | `publishedAt` > current date | Date parsing errors, timezone issues |
| **HTML entities** | `&#8217;`, `&nbsp;`, `&amp;` in content | RSS feeds contain encoded HTML |
| **JavaScript fragments** | Code snippets in content | JS-rendered pages, incomplete extraction |

## Diagnostic Workflow

### Step 1: Identify Affected Signals

Query the database to find signals with quality issues:

```sql
-- Truncated content (ends without punctuation)
SELECT id, "sourceUrl", LENGTH("rawContent") as len, 
       RIGHT("rawContent", 100) as ending
FROM "Signal"
WHERE "rawContent" !~ '[.!?)"\']\s*$'
  AND LENGTH("rawContent") > 100
ORDER BY "publishedAt" DESC
LIMIT 20;

-- Missing authors
SELECT id, "sourceUrl", "sourceType"
FROM "Signal"
WHERE author IS NULL OR author = ''
ORDER BY "publishedAt" DESC
LIMIT 20;

-- Future dates
SELECT id, "sourceUrl", "publishedAt", "scrapedAt"
FROM "Signal"
WHERE "publishedAt" > NOW()
ORDER BY "publishedAt" DESC;

-- HTML entities in content
SELECT id, "sourceUrl", LEFT("rawContent", 200) as preview
FROM "Signal"
WHERE "rawContent" ~ '&#\d+;|&[a-z]+;'
LIMIT 20;
```

### Step 2: Analyze Root Cause

For each affected signal:

1. **Check the source URL** - Visit manually or fetch with curl
2. **Identify the scraper** - Check `scraperName` field
3. **Test the scraper** - Run scraper against the URL:

```typescript
import { BlogScraper } from "@/lib/scraping/blog-scraper";

const scraper = new BlogScraper();
const result = await scraper.scrapeArticle(url);
console.log("Content length:", result.content.length);
console.log("Author:", result.author);
console.log("Published:", result.publishedAt);
```

4. **Check for bot protection** - Look for 403/401 responses, CAPTCHAs, or JS-required pages

### Step 3: Fix the Scraper

Based on root cause:

**Missing author extraction:**
```typescript
// In blog-scraper.ts or news-scraper.ts
const authorSelectors = [
  'meta[property="article:author"]',
  'meta[name="author"]',
  '[itemprop="author"] [itemprop="name"]',
  '.author-name',
  '.byline a',
];

for (const selector of authorSelectors) {
  const el = $(selector).first();
  if (el.length) {
    const author = el.attr("content") || el.text().trim();
    if (author) return author;
  }
}
```

**Truncated content (IR/press release pages):**
```typescript
// Add IR-specific selectors to extractBody()
const selectors = [
  '[itemprop="articleBody"]',
  '.press-release-content, .press-release-body',
  '.field--name-body, .node__content',
  'main [role="main"]',
  // ... existing selectors
];
```

**HTML entity cleaning:**
```typescript
function cleanHtmlEntities(text: string): string {
  return text
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}
```

### Step 4: Re-scrape Affected Signals

Create a re-scrape script:

```typescript
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

async function rescrapeSignals(signalIds: string[]) {
  const { prisma } = await import("../src/lib/db");
  const { BlogScraper } = await import("../src/lib/scraping/blog-scraper");
  
  const scraper = new BlogScraper();
  
  for (const signalId of signalIds) {
    const signal = await prisma.signal.findUnique({ where: { id: signalId } });
    if (!signal) continue;
    
    const result = await scraper.scrapeArticle(signal.sourceUrl);
    if (!result || result.content.length < 100) {
      console.log(`❌ Failed: ${signal.sourceUrl}`);
      continue;
    }
    
    await prisma.signal.update({
      where: { id: signalId },
      data: {
        rawContent: result.content,
        author: result.author || signal.author,
        metadata: {
          ...signal.metadata,
          rescrapedAt: new Date().toISOString(),
          rescrapeSource: "blog-scraper",
        },
      },
    });
    
    console.log(`✅ Updated: ${signal.sourceUrl} (${result.content.length} chars)`);
    await new Promise(r => setTimeout(r, 1500)); // Rate limiting
  }
  
  await prisma.$disconnect();
}

// Usage
const affectedIds = [
  "signal-id-1",
  "signal-id-2",
];
rescrapeSignals(affectedIds);
```

### Step 5: Verify Fixes

After re-scraping, verify improvements:

```sql
SELECT 
  id,
  LEFT(title, 60) as title,
  LENGTH("rawContent") as content_length,
  author,
  metadata->>'rescrapeSource' as rescraped,
  RIGHT("rawContent", 80) as ending
FROM "Signal"
WHERE id IN ('signal-id-1', 'signal-id-2');
```

Check:
- [ ] Content length increased
- [ ] Content ends with proper punctuation
- [ ] Author field populated
- [ ] No HTML entities or JS fragments

## Handling Bot Protection

### Tesla-style Bot Protection (403 Forbidden)

**Symptoms:** All requests return 403, even with proper User-Agent

**Attempted solutions (in order):**
1. Direct scraping with browser User-Agent
2. Wayback Machine snapshots
3. Google Cache
4. AMP cache

**If all fail:**
- Mark signals as "limited by source"
- Clean existing content (remove JS fragments, HTML entities)
- Document limitation in signal metadata

```typescript
await prisma.signal.update({
  where: { id: signalId },
  data: {
    metadata: {
      ...signal.metadata,
      cleanedAt: new Date().toISOString(),
      cleanMethod: "js-fragment-removal",
      limitation: "Source blocks scraping",
    },
  },
});
```

### JS-Rendered Pages (0 content extracted)

**Symptoms:** Scraper fetches page but extracts 0 chars

**Solutions:**
1. Add `<main>` tag fallback to scraper
2. Check for `<noscript>` content
3. Use headless browser (Playwright/Puppeteer) for future scrapes
4. For existing signals: clean JS fragments from RSS descriptions

## Prevention: Signal Validator

Integrate validation into discovery pipeline:

```typescript
// src/lib/scraping/signal-validator.ts
export function validateAndCleanSignal(data: {
  publishedAt: Date | null;
  author: string | null;
  rawContent: string;
  sourceUrl: string;
}): {
  valid: boolean;
  issues: string[];
  cleanedData: { ... };
} {
  const issues = [];
  const cleaned = { ...data };
  
  // Check future dates
  if (data.publishedAt && data.publishedAt > new Date()) {
    issues.push("Future date detected");
    cleaned.publishedAt = new Date(); // Or null
  }
  
  // Check content completeness
  if (data.rawContent.length < 100) {
    issues.push("Content too short");
  }
  
  // Clean HTML entities
  cleaned.rawContent = cleanHtmlEntities(data.rawContent);
  
  return { valid: issues.length === 0, issues, cleanedData: cleaned };
}
```

Integrate in `discovery.ts`:

```typescript
const validation = validateAndCleanSignal({
  publishedAt: item.pubDate,
  author: item.author || null,
  rawContent: content,
  sourceUrl: item.link,
});

if (!validation.valid) {
  log.warn("Signal validation issues", { issues: validation.issues });
}

// Use cleaned data
await prisma.signal.create({
  data: {
    publishedAt: validation.cleanedData.publishedAt,
    author: validation.cleanedData.author,
    rawContent: validation.cleanedData.rawContent,
    // ...
  },
});
```

## Reference Scripts

### cleanup-signal-data.ts

General cleanup for existing signals:
- Fix future dates
- Add missing authors (fetch from source)
- Add missing metadata (extract `og:site_name`)
- Clean HTML entities
- Detect truncated content

Run: `pnpm tsx scripts/cleanup-signal-data.ts`

### rescrape-truncated-signals.ts

Re-scrape specific signals with improved extractors:
- Uses BlogScraper with IR page selectors
- Cleans JS fragments from content
- Updates signal with full content

Run: `pnpm tsx scripts/rescrape-truncated-signals.ts`

## Checklist

When debugging signal quality issues:

- [ ] Identify affected signals via SQL queries
- [ ] Analyze root cause (scraper limitation, bot protection, etc.)
- [ ] Test scraper against source URL
- [ ] Fix scraper (add selectors, improve extraction)
- [ ] Re-scrape affected signals
- [ ] Verify improvements (content length, metadata, punctuation)
- [ ] Integrate validator into discovery pipeline
- [ ] Document limitations (bot protection, JS-rendered pages)
- [ ] Update signal metadata with cleanup info

## Examples

### Example 1: AMD IR Pages

**Issue:** 4 AMD signals had truncated content (2,000 chars)

**Root cause:** RSS feed descriptions limited to 2,000 chars

**Fix:** 
1. Added IR page selectors to BlogScraper
2. Re-scraped with `scrapeArticle()`
3. Result: 5,935 - 8,980 chars (complete press releases)

### Example 2: Tesla IR Pages

**Issue:** 4 Tesla signals had JS fragments, HTML entities

**Root cause:** Tesla blocks scraping with 403, pages are JS-rendered SPAs

**Fix:**
1. Attempted Wayback Machine, Google Cache - all blocked
2. Cleaned existing content (removed JS fragments, decoded HTML entities)
3. Documented limitation in metadata
4. Result: Cleaner content, but still limited by source

### Example 3: Missing Authors

**Issue:** 11 blog signals had no author

**Root cause:** RSS scraper didn't extract `dc:creator`, `author` tags

**Fix:**
1. Added author extraction to RSS scraper
2. Cleanup script fetched authors from source pages
3. Result: All 11 signals now have authors
