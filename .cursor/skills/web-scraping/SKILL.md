---
name: web-scraping
description: Use when extracting data from public websites, implementing polite scraping patterns, handling rate limits and caching, or working with the TypeScript scraping pipeline
---

# Web Scraping

## Overview

Scraping must be **polite, resilient, and cached**. Always respect rate limits, cache responses to avoid redundant requests, and implement retry logic for transient failures.

## When to Use

- Extracting data from public websites
- Fetching news articles, press releases, or filings
- Any HTTP request to external sources
- When you need to respect robots.txt or rate limits

## Core Pattern

### Before: Direct Scraping (Problematic)

```typescript
// Bad: Direct scraping without politeness
const response = await fetch(url);
const html = await response.text();
```

**Problems:**
- No caching → redundant requests → rate limit bans
- No retry logic → transient failures break the pipeline
- No rate limiting → disrespectful to source
- No User-Agent → blocked by anti-bot systems

### After: Polite Scraping

```typescript
// Good: Polite scraping with caching and retry
import { getProvider } from "@/lib/scraping/provider";

async function scrapePolite(url: string): Promise<string> {
  const scraper = getProvider();
  
  // Check cache first
  const cached = await scraper.cache.get(url);
  if (cached && !scraper.cache.isExpired(cached)) {
    return cached.content;
  }
  
  // Respect rate limits (1 request per second default)
  await scraper.rateLimiter.wait();
  
  // Fetch with retry logic
  const html = await scraper.fetchWithRetry(url, {
    headers: {
      "User-Agent": "TheTell-Bot/1.0 (+https://thetell.ai/bot)",
    },
    timeout: 30000,
  });
  
  // Cache the response
  await scraper.cache.set(url, html, { ttl: 3600 });
  
  return html;
}
```

## Quick Reference

| Aspect | Rule |
|--------|------|
| **Rate limiting** | 1 req/sec default, respect robots.txt |
| **Caching** | TTL based on content type (1hr for news, 24hr for filings) |
| **Retry logic** | Exponential backoff, max 3 retries |
| **User-Agent** | Always set (e.g., "TheTell-Bot/1.0") |
| **Timeouts** | 30 seconds default |
| **Error handling** | Network, parsing, anti-bot detection |

### Cache TTL Guidelines

| Content Type | TTL | Rationale |
|--------------|-----|-----------|
| News articles | 1 hour | Time-sensitive, may update |
| Press releases | 4 hours | Semi-static |
| SEC filings | 24 hours | Static, rarely change |
| Company profiles | 24 hours | Static |
| Social media | 15 minutes | Very time-sensitive |

## Implementation Details

### Scraping Provider

The scraping provider at `src/lib/scraping/provider.ts` handles:

```typescript
import { BaseScraper } from "@/lib/scraping/base-scraper";

class PoliteScraper extends BaseScraper {
  async fetchWithRetry(url: string, options?: FetchOptions): Promise<string> {
    const maxRetries = 3;
    const backoffBase = 1000; // 1 second
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(options?.timeout ?? 30000),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.text();
      } catch (error) {
        if (attempt === maxRetries - 1) throw error;
        
        const backoff = backoffBase * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
    
    throw new Error("Max retries exceeded");
  }
}
```

### Rate Limiter

```typescript
class RateLimiter {
  private lastRequest = 0;
  private minInterval = 1000; // 1 second
  
  async wait(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;
    
    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequest = Date.now();
  }
}
```

### Cache Implementation

```typescript
interface CacheEntry {
  content: string;
  timestamp: number;
  ttl: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry>();
  
  async get(key: string): Promise<CacheEntry | null> {
    return this.cache.get(key) ?? null;
  }
  
  async set(key: string, content: string, options: { ttl: number }): Promise<void> {
    this.cache.set(key, {
      content,
      timestamp: Date.now(),
      ttl: options.ttl,
    });
  }
  
  isExpired(entry: CacheEntry): boolean {
    const age = Date.now() - entry.timestamp;
    return age > entry.ttl * 1000;
  }
}
```

## Common Mistakes

### Mistake 1: Not caching

**Problem:** Redundant requests → rate limit bans.

```typescript
// Bad: No caching
async function scrape(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

// Good: Cache responses
async function scrape(url: string): Promise<string> {
  const cached = await cache.get(url);
  if (cached && !cache.isExpired(cached)) {
    return cached.content;
  }
  
  const response = await fetch(url);
  const content = await response.text();
  await cache.set(url, content, { ttl: 3600 });
  return content;
}
```

### Mistake 2: No retry logic

**Problem:** Transient failures break the pipeline.

```typescript
// Bad: No retry
async function fetch(url: string): Promise<string> {
  const response = await fetch(url); // Fails once = game over
  return response.text();
}

// Good: Retry with backoff
async function fetchWithRetry(url: string, maxRetries = 3): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      return response.text();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await sleep(1000 * Math.pow(2, attempt));
    }
  }
  throw new Error("Unreachable");
}
```

### Mistake 3: Ignoring robots.txt

**Problem:** Legal issues, IP bans.

```typescript
// Good: Check robots.txt
import { RobotsParser } from "robots-parser";

async function canScrape(url: string, userAgent: string): Promise<boolean> {
  const robotsUrl = new URL("/robots.txt", url).toString();
  
  try {
    const response = await fetch(robotsUrl);
    if (!response.ok) return true; // No robots.txt = allowed
    
    const robotsTxt = await response.text();
    const parser = new RobotsParser(robotsUrl, robotsTxt);
    
    return parser.canFetch(userAgent, url);
  } catch {
    return true; // If we can't fetch robots.txt, assume allowed
  }
}
```

### Mistake 4: No User-Agent

**Problem:** Blocked by anti-bot systems.

```typescript
// Bad: No User-Agent
const response = await fetch(url);

// Good: Set User-Agent
const response = await fetch(url, {
  headers: {
    "User-Agent": "TheTell-Bot/1.0 (+https://thetell.ai/bot)",
  },
});
```

## Tools

- **fetch** - Native HTTP client (Node.js 18+)
- **cheerio** - HTML parsing and manipulation
- **robots-parser** - robots.txt parsing
- **Playwright** - JavaScript-heavy sites (use sparingly)

## Advanced Patterns

### Handling JavaScript-Heavy Sites

```typescript
import { chromium } from "playwright";

async function scrapeJsSite(url: string): Promise<string> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    const content = await page.content();
    return content;
  } finally {
    await browser.close();
  }
}
```

### Extracting Article Content

```typescript
import * as cheerio from "cheerio";

interface ArticleData {
  title: string;
  text: string;
  authors: string[];
  publishDate: string | null;
}

function extractArticle(html: string, url: string): ArticleData {
  const $ = cheerio.load(html);
  
  const title = $("h1").first().text().trim();
  const text = $("article").text().trim();
  const authors = $("meta[name='author']").attr("content")?.split(",") ?? [];
  const publishDate = $("meta[property='article:published_time']").attr("content") ?? null;
  
  return { title, text, authors, publishDate };
}
```

## Related Skills

- **signal-analysis** - Processing scraped data into analysis-ready format
- **llm-abstraction** - Using LLM providers for content extraction
