---
name: web-scraping
description: Use when extracting data from public websites, implementing polite scraping patterns, or handling rate limits and caching for web requests
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

```python
# Bad: Direct scraping without politeness
import requests

def scrape(url: str) -> str:
    response = requests.get(url)
    return response.text
```

**Problems:**
- No caching → redundant requests → rate limit bans
- No retry logic → transient failures break the pipeline
- No rate limiting → disrespectful to source
- No User-Agent → blocked by anti-bot systems

### After: Polite Scraping

```python
# Good: Polite scraping with caching and retry
import httpx
from datetime import datetime, timedelta
from functools import wraps

# Simple cache
_cache: dict[str, tuple[str, datetime]] = {}
CACHE_TTL = timedelta(hours=1)

async def scrape_polite(url: str) -> str:
    """Polite scraping with caching and rate limiting."""
    # Check cache first
    if cached := _cache.get(url):
        content, timestamp = cached
        if datetime.now() - timestamp < CACHE_TTL:
            return content
    
    # Respect rate limits (1 request per second default)
    await respect_rate_limit(url)
    
    # Fetch with retry logic
    response = await fetch_with_retry(url)
    
    # Cache the response
    _cache[url] = (response, datetime.now())
    
    return response

async def fetch_with_retry(
    url: str,
    max_retries: int = 3,
    backoff_factor: float = 2.0
) -> str:
    """Fetch with exponential backoff retry."""
    async with httpx.AsyncClient() as client:
        for attempt in range(max_retries):
            try:
                response = await client.get(
                    url,
                    headers={"User-Agent": "TheTell-Bot/1.0"},
                    timeout=30.0
                )
                response.raise_for_status()
                return response.text
            except (httpx.HTTPError, httpx.TimeoutException) as e:
                if attempt == max_retries - 1:
                    raise
                wait_time = backoff_factor ** attempt
                await asyncio.sleep(wait_time)

# Rate limiting per domain
_last_request: dict[str, datetime] = {}
MIN_REQUEST_INTERVAL = timedelta(seconds=1)

async def respect_rate_limit(url: str):
    """Ensure minimum time between requests to same domain."""
    from urllib.parse import urlparse
    domain = urlparse(url).netloc
    
    if domain in _last_request:
        elapsed = datetime.now() - _last_request[domain]
        if elapsed < MIN_REQUEST_INTERVAL:
            wait_time = (MIN_REQUEST_INTERVAL - elapsed).total_seconds()
            await asyncio.sleep(wait_time)
    
    _last_request[domain] = datetime.now()
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

## Common Mistakes

### Mistake 1: Not caching

**Problem:** Redundant requests → rate limit bans.

```python
# Bad: No caching
async def scrape(url: str) -> str:
    response = await httpx.get(url)
    return response.text

# Calling this 10 times for same URL = 10 requests

# Good: Cache responses
async def scrape(url: str) -> str:
    if cached := cache.get(url):
        return cached
    response = await httpx.get(url)
    cache.set(url, response, ttl=3600)
    return response
```

### Mistake 2: No retry logic

**Problem:** Transient failures break the pipeline.

```python
# Bad: No retry
async def fetch(url: str) -> str:
    response = await httpx.get(url)  # Fails once = game over
    return response.text

# Good: Retry with backoff
async def fetch(url: str) -> str:
    for attempt in range(3):
        try:
            response = await httpx.get(url)
            return response.text
        except httpx.HTTPError:
            if attempt == 2:
                raise
            await asyncio.sleep(2 ** attempt)
```

### Mistake 3: Ignoring robots.txt

**Problem:** Legal issues, IP bans.

```python
# Good: Check robots.txt
from urllib.robotparser import RobotFileParser

async def can_scrape(url: str) -> bool:
    from urllib.parse import urlparse
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    
    rp = RobotFileParser()
    rp.set_url(robots_url)
    rp.read()
    
    return rp.can_fetch("TheTell-Bot/1.0", url)
```

### Mistake 4: No User-Agent

**Problem:** Blocked by anti-bot systems.

```python
# Bad: No User-Agent
response = await httpx.get(url)

# Good: Set User-Agent
headers = {"User-Agent": "TheTell-Bot/1.0 (research@thetell.ai)"}
response = await httpx.get(url, headers=headers)
```

## Tools

- **httpx** - Async HTTP client (preferred over requests)
- **BeautifulSoup** - HTML parsing
- **Playwright** - JavaScript-heavy sites (use sparingly)
- **newspaper3k** - Article extraction
- **trafilatura** - Content extraction

## Advanced Patterns

### Handling JavaScript-Heavy Sites

```python
# Use Playwright only when necessary
from playwright.async_api import async_playwright

async def scrape_js_site(url: str) -> str:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto(url)
        await page.wait_for_selector("article")  # Wait for content
        content = await page.content()
        await browser.close()
        return content
```

### Extracting Article Content

```python
from newspaper import Article

def extract_article(url: str, html: str) -> dict:
    article = Article(url)
    article.set_html(html)
    article.parse()
    
    return {
        "title": article.title,
        "text": article.text,
        "authors": article.authors,
        "publish_date": article.publish_date,
    }
```
