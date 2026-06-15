---
name: browser-testing-workflows
description: >-
  Browser testing workflows for authenticated SPAs using Chrome DevTools MCP or Playwright.
  Covers cookie-based authentication, DOM exploration strategies, selector discovery,
  data extraction from dynamic pages, lazy loading handling, and iterative testing patterns.
  Use when testing authenticated web apps, scraping data from SPAs, exploring unknown DOM structures,
  debugging browser automation, or when the user mentions browser testing, web scraping, or SPA testing.
disable-model-invocation: false
---

# Browser Testing Workflows for Authenticated SPAs

Patterns derived from real browser testing sessions on complex authenticated SPAs. Complements the `use-chrome-devtools-mcp` skill which covers tool invocation syntax.

## Authentication Patterns

### Cookie-Based Authentication

For apps that use HTTP-only session cookies:

**Pattern 1: Storage State Persistence (Recommended)**
```
1. Launch browser with visible UI (headless: false)
2. Navigate to app → user logs in manually
3. Save full storage state:
   evaluate_script({
     pageId,
     function: "() => JSON.stringify(document.cookie)"
   })
4. Persist cookies to file for reuse across operations
5. On subsequent runs: inject cookies before navigation
```

**Pattern 2: Encrypted Cookie from Database**
```
1. Fetch encrypted session cookie from DB
2. Decrypt using AES-256-GCM (IV=first 16 bytes, authTag=bytes 16-32, ciphertext=rest)
3. Inject cookie into browser context before navigation
4. Validate session: check for /login redirect after navigation
```

**Session Validation:**
```javascript
// After navigating to the app:
evaluate_script({
  pageId,
  function: "() => window.location.href"
})
// If URL contains "/login" or "/oauth" → cookie expired, need re-auth
```

### Cookie Injection (Chrome DevTools MCP)
```
evaluate_script({
  pageId,
  function: `() => {
    document.cookie = "session_name=session_value; path=/; domain=.example.com";
    return "cookie set";
  }`
})
```

**Note**: HTTP-only cookies cannot be set via `document.cookie`. For those, use browser context APIs (Playwright's `context.addCookies()`) or storage state files.

## DOM Exploration Strategies

### Strategy 1: Broad Text Extraction

When you don't know the page structure:

```
1. navigate_page → go to target URL
2. wait_for → wait for key text to appear
3. evaluate_script → extract full page text:
   function: "() => document.body?.innerText || ''"
4. Analyze returned text to understand page layout
5. Take snapshot for element UIDs
```

### Strategy 2: Selector Discovery

When you need to find the right CSS selectors:

```
evaluate_script({
  pageId,
  function: `() => {
    const selectors = [
      'article[data-view-name="update"]',
      'div.feed-shared-update-v2',
      'div.occludable-update',
      '[data-urn*="urn:li:activity"]',
      '[role="row"]',
      'table tr'
    ];
    const results = {};
    for (const sel of selectors) {
      results[sel] = document.querySelectorAll(sel).length;
    }
    return results;
  }`
})
```

**Pattern**: Test 5-10 candidate selectors, pick the first one that returns elements.

### Strategy 3: TreeWalker for Numeric Data

When data is embedded in deeply nested elements without clear selectors:

```
evaluate_script({
  pageId,
  function: `() => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT
    );
    const numericElements = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent?.trim() || '';
      // Leaf elements with numeric content
      if (node.childElementCount === 0 &&
          text.length > 0 &&
          text.length < 50 &&
          /\\d/.test(text)) {
        numericElements.push({
          tag: node.tagName,
          text: text,
          class: node.className,
          parent: node.parentElement?.tagName
        });
      }
    }
    return numericElements.slice(0, 100);
  }`
})
```

### Strategy 4: Table/Grid Structure Detection

For analytics dashboards with tabular data:

```
evaluate_script({
  pageId,
  function: `() => {
    const structure = {
      tables: document.querySelectorAll('table, [role="table"], [role="grid"]').length,
      rows: document.querySelectorAll('tr, [role="row"]').length,
      cells: document.querySelectorAll('td, [role="gridcell"]').length,
      headers: document.querySelectorAll('th, [role="columnheader"]').length
    };
    // Sample first row's cells
    const firstRow = document.querySelector('tr, [role="row"]');
    if (firstRow) {
      const cells = firstRow.querySelectorAll('td, [role="gridcell"]');
      structure.sampleRow = Array.from(cells).map(c => ({
        text: c.textContent?.trim(),
        class: c.className
      }));
    }
    return structure;
  }`
})
```

## Data Extraction Patterns

### Pattern 1: Text-Based Parsing (Fallback)

When CSS class names are unstable:

```
evaluate_script({
  pageId,
  function: `() => {
    const allText = document.body?.innerText || '';
    const lines = allText.split('\\n').map(l => l.trim()).filter(Boolean);
    const result = {};

    for (const line of lines) {
      // Parse engagement counts from text
      if (!result.reactions && /\\d/.test(line) && /react|like/i.test(line)) {
        const match = line.match(/(\\d+)\\s*others?\\s+react/i) || line.match(/(\\d+)/);
        if (match) result.reactions = parseInt(match[1]);
      }
      if (!result.comments && /\\d/.test(line) && /comment/i.test(line)) {
        const match = line.match(/(\\d+)/);
        if (match) result.comments = parseInt(match[1]);
      }
      if (!result.shares && /\\d/.test(line) && /repost|share/i.test(line)) {
        const match = line.match(/(\\d+)/);
        if (match) result.shares = parseInt(match[1]);
      }
      if (!result.impressions && /\\d/.test(line) && /impression/i.test(line)) {
        const match = line.match(/(\\d+)/);
        if (match) result.impressions = parseInt(match[1]);
      }
    }
    return result;
  }`
})
```

**Number parsing helper** for formats like "1,234", "5K", "1.2M":
```javascript
function parseNumber(text) {
  text = text.trim().toUpperCase();
  const multiplier = text.includes('K') ? 1000 : text.includes('M') ? 1000000 : 1;
  const cleaned = text.replace(/[KM,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * multiplier);
}
```

### Pattern 2: Link Discovery for Post URNs

For discovering post URLs/URNs in activity feeds:

```
evaluate_script({
  pageId,
  function: `() => {
    const allLinks = Array.from(document.querySelectorAll('a'));
    return allLinks
      .filter(a => {
        const href = a.getAttribute('href') || '';
        return href.includes('urn:li:share') ||
               href.includes('urn:li:activity') ||
               href.includes('/feed/update/');
      })
      .map(a => ({
        href: a.getAttribute('href'),
        text: a.innerText?.trim()
      }))
      .slice(0, 20);
  }`
})
```

### Pattern 3: Structured Data from Containers

When posts/items are in container elements:

```
evaluate_script({
  pageId,
  function: `() => {
    const containers = document.querySelectorAll('article, [role="row"], .post-item');
    return Array.from(containers).slice(0, 10).map(container => {
      const text = container.innerText?.trim() || '';
      const links = Array.from(container.querySelectorAll('a'));
      const urnLink = links.find(a => {
        const href = a.getAttribute('href') || '';
        return href.includes('urn:li:');
      });
      return {
        text: text.substring(0, 500),
        urn: urnLink?.getAttribute('href') || null,
        numericData: Array.from(container.querySelectorAll('*'))
          .filter(el => el.childElementCount === 0 && /\\d/.test(el.textContent || ''))
          .map(el => el.textContent?.trim())
      };
    });
  }`
})
```

## Handling Dynamic Content

### Lazy Loading Scroll Pattern

For feeds that lazy-load content on scroll:

```
evaluate_script({
  pageId,
  function: `async () => {
    const initialCount = document.querySelectorAll('article, [role="row"]').length;
    for (let i = 0; i < 5; i++) {
      window.scrollBy(0, window.innerHeight);
      await new Promise(r => setTimeout(r, 1000));
    }
    window.scrollTo(0, 0); // scroll back to top
    const finalCount = document.querySelectorAll('article, [role="row"]').length;
    return { initial: initialCount, final: finalCount };
  }`
})
```

**After scrolling**: Take a fresh snapshot to see newly loaded elements.

### Waiting for SPA Render

SPAs often need more time than `domcontentloaded`:

```
// Option 1: Wait for specific text
wait_for({
  pageId,
  text: ["Analytics", "Dashboard", "Posts"],  // any of these
  timeout: 15000
})

// Option 2: Wait then verify with snapshot
wait_for({ pageId, text: ["Creator"], timeout: 10000 })
take_snapshot({ pageId })  // verify content loaded

// Option 3: Evaluate with retry
evaluate_script({
  pageId,
  function: `async () => {
    for (let i = 0; i < 10; i++) {
      const el = document.querySelector('table, [role="table"]');
      if (el) return { found: true, tag: el.tagName };
      await new Promise(r => setTimeout(r, 1000));
    }
    return { found: false };
  }`
})
```

## Network Request Capture

### Capturing API Calls

For understanding what data the page fetches:

```
// After page load, list network requests
list_network_requests({
  pageId,
  resourceTypes: ["xhr", "fetch"],
  pageSize: 50
})

// Filter for relevant endpoints
// Look for: analytics, voyager, api, data endpoints
```

### Capturing Specific API Responses

```
evaluate_script({
  pageId,
  function: `() => {
    // Intercept fetch calls
    const originalFetch = window.fetch;
    const captured = [];
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const url = args[0];
      if (typeof url === 'string' &&
          (url.includes('analytics') || url.includes('voyager'))) {
        captured.push({ url, status: response.status });
      }
      return response;
    };
    return { message: "Interceptor installed, navigate to trigger requests" };
  }`
})
// Then navigate or interact to trigger the API calls
// Note: This captures request metadata, not response bodies
```

## Debug API Route Pattern

For debugging browser automation in Next.js apps, create temporary debug routes:

```typescript
// app/api/debug/explore-page/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  // Use your browser automation service here
  // Example: const browser = await cloakbrowser.launch();

  try {
    // Run multiple selector tests
    const analysis = {
      // Example analysis results
    };

    return NextResponse.json({ success: true, analysis });
  } finally {
    // Cleanup browser resources
  }
}
```

**Usage**: Call via `curl` or browser → analyze JSON response → iterate on selectors.

**Cleanup**: Delete debug routes after use. Don't commit them.

## Iterative Testing Workflow

### The Discovery Loop

```
1. Navigate to page
2. Take snapshot → understand structure
3. Take screenshot → visual verification
4. evaluate_script → broad text extraction
5. Analyze: What selectors might work?
6. evaluate_script → test candidate selectors
7. Pick working selector → extract data
8. If extraction fails → go to step 4 with new approach
```

### Selector Fallback Hierarchy

Always build extraction with fallbacks:

```
Priority 1: data-* attributes (most stable)
  → [data-urn], [data-test-id], [data-view-name]

Priority 2: ARIA roles (stable, semantic)
  → [role="row"], [role="gridcell"], [role="table"]

Priority 3: Semantic HTML (stable)
  → table, tr, td, article, main

Priority 4: CSS class names (fragile — last resort)
  → .social-details-social-counts__reactions-count
```

### Number Format Handling

Social platforms use abbreviated numbers. Handle all formats:

```javascript
function parseEngagementNumber(text) {
  if (!text) return 0;
  text = text.trim().toLowerCase();

  // "Nupur Waghmare and 2 others reacted"
  const othersMatch = text.match(/(\d+)\s*others?\s+react/i);
  if (othersMatch) return parseInt(othersMatch[1]) + 1; // +1 for first person

  // "244 impressions", "5.2K views", "1.2M followers"
  const numMatch = text.match(/([\d,.]+)\s*(k|m)?/i);
  if (numMatch) {
    const num = parseFloat(numMatch[1].replace(',', ''));
    const mult = numMatch[2] === 'k' ? 1000 : numMatch[2] === 'm' ? 1000000 : 1;
    return Math.round(num * mult);
  }

  return 0;
}
```

## Anti-Patterns from Real Sessions

### 1. Wrong URL for Activity Data

**Problem**: Navigating to wrong page shows OTHER people's posts.
**Fix**: Use the correct user activity URL for the user's own activity.

### 2. CSS Class Selectors on Frequently-Changing Sites

**Problem**: CSS selectors break when sites update DOM.
**Fix**: Text-based regex parsing as primary, CSS selectors as fallback.

### 3. No Scroll for Lazy-Loaded Feeds

**Problem**: Activity feed containers exist but are empty — content loads on scroll.
**Fix**: Scroll 5+ times with 1s delays, then re-query.

### 4. Hardcoded Delays Instead of Waits

**Problem**: `waitForTimeout(15000)` is fragile — sometimes too short, sometimes wasteful.
**Fix**: Use `wait_for({ text: [...] })` or `evaluate_script` with retry loop.

### 5. `waitUntil: 'networkidle'` on SPAs

**Problem**: SPAs have background requests that never settle → timeout.
**Fix**: Use `waitUntil: 'domcontentloaded'` + manual `wait_for` for specific content.

### 6. Looking for Wrong URL Patterns

**Problem**: Searching for wrong URL patterns when posts use different identifiers in hrefs.
**Fix**: Search for URN patterns in links, not URL path patterns.

### 7. Missing Parameters in evaluate_script

**Problem**: `ReferenceError: selectors is not defined` — forgot to pass variables to evaluate.
**Fix**: Pass data as second argument: `evaluate_script({ function: "(data) => ...", args: [data] })`

### 8. Headless Browser Without Storage State

**Problem**: Headless browser has no cookies → site blocks request.
**Fix**: Use storage state file or inject cookies before navigation.

## Verification Checklist

Before completing a browser testing session:

- [ ] Session validated (not redirected to login)
- [ ] DOM structure understood (snapshot + screenshot taken)
- [ ] Working selectors identified and tested
- [ ] Data extraction returns expected structure
- [ ] Lazy-loaded content handled (scroll if needed)
- [ ] Number formats parsed correctly (K, M, abbreviated)
- [ ] Console checked for errors (`list_console_messages`)
- [ ] Network requests checked for failures (`list_network_requests`)
- [ ] Debug routes cleaned up (if created)
- [ ] Results saved/persisted for next iteration

## When to Use Chrome DevTools MCP vs Playwright

| Scenario | Tool |
|----------|------|
| Quick DOM inspection, clicking, form filling | Chrome DevTools MCP |
| Cookie-based auth with HTTP-only cookies | Playwright (context.addCookies) |
| Storage state persistence across runs | Playwright |
| Network request interception | Playwright (page.on('request')) |
| Running inside Next.js server context | Playwright via debug API routes |
| Interactive exploration with visual feedback | Chrome DevTools MCP |
| Automated data extraction scripts | Playwright |
| Debugging live page in browser | Chrome DevTools MCP |
