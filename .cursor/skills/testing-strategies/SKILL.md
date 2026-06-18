---
name: testing-strategies
description: Use when writing tests for any component, especially for scraping, LLM integration, or analysis pipeline; when dealing with non-deterministic systems or external dependencies
---

# Testing Strategies

## Overview

Test non-deterministic systems (LLM outputs, web scraping, analysis pipelines) reliably by mocking external dependencies, testing pure functions, and using snapshot testing for output format validation. The key is separating logic testing from integration testing.

## When to Use

- Writing tests for web scraping code
- Testing LLM-powered features
- Building tests for the analysis pipeline
- Any component with external dependencies (HTTP, APIs, databases)
- Testing non-deterministic outputs
- Scenarios where tests could be slow, expensive, or flaky

## Test Framework

- **Vitest** — Unit and integration tests
- **React Testing Library** — Component tests
- **Playwright** — End-to-end browser tests
- **MSW (Mock Service Worker)** — HTTP request mocking

## Core Pattern

### Scraping Tests

Mock HTTP responses, test parsing logic in isolation.

```typescript
// Before: Testing against live sites (slow, flaky, expensive)
import { scrapeArticle } from "@/lib/scraping/news-scraper";

test("scrape article", async () => {
  const result = await scrapeArticle("https://example.com/article"); // Live HTTP call
  expect(result.title).toBe("Expected Title");
});

// After: Mock HTTP, test parsing
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const server = setupServer(
  http.get("https://example.com/article", () => {
    return HttpResponse.html(`
      <html>
        <head><title>Test Article</title></head>
        <body><article>Article content here</article></body>
      </html>
    `);
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test("parse article", async () => {
  const result = await scrapeArticle("https://example.com/article");
  expect(result.title).toBe("Test Article");
  expect(result.body).toContain("Article content");
});
```

### LLM Tests

Mock LLM responses, test prompt construction and response parsing.

```typescript
import { vi } from "vitest";
import { getProvider } from "@/lib/ai/provider";

// Mock the provider
vi.mock("@/lib/ai/provider", () => ({
  getProvider: vi.fn(() => ({
    completeStructured: vi.fn().mockResolvedValue({
      facts: [{ text: "Revenue up 20%", category: "financial", confidence: 0.9 }],
    }),
  })),
}));

test("extract facts parsing", async () => {
  const { extractFacts } = await import("@/lib/ai/fact-extraction");

  const result = await extractFacts("Apple announced new iPhone features.");

  expect(result.facts).toHaveLength(1);
  expect(result.facts[0].text).toBe("Revenue up 20%");
});

test("extract facts prompt construction", () => {
  const sampleText = "Apple announced new iPhone features.";
  const messages = [
    { role: "system", content: "Extract key facts..." },
    { role: "user", content: sampleText },
  ];

  expect(messages[1].content).toContain("Apple");
  expect(messages[0].content).toContain("Extract key facts");
});
```

### Analysis Tests

Test inference logic with fixed inputs.

```typescript
import { describe, expect, test } from "vitest";

describe("classifySignal", () => {
  test("classifies financial signal", () => {
    const facts = [
      { text: "reported revenue growth", category: "financial", confidence: 0.9 },
      { text: "increased profit margins", category: "financial", confidence: 0.85 },
    ];

    const signalType = classifySignal(facts);
    expect(signalType).toBe("FINANCIAL");
  });
});

describe("scoreConfidence", () => {
  test("high confidence with multiple facts from official source", () => {
    const facts = [
      { text: "Fact 1", category: "financial", confidence: 0.9 },
      { text: "Fact 2", category: "financial", confidence: 0.85 },
    ];

    const confidence = scoreConfidence(facts, []);
    expect(confidence).toBeGreaterThan(0.5);
    expect(confidence).toBeLessThanOrEqual(1.0);
  });
});
```

## Testing Non-Deterministic Systems

### Test Structure, Not Content

```typescript
// Bad: Testing exact LLM output content (will fail due to non-determinism)
test("extract facts", async () => {
  const result = await extractFacts("Apple announced iPhone");
  expect(result.facts[0].text).toBe("Apple announced new iPhone"); // Might say "Apple Inc."
});

// Good: Testing output structure
test("extract facts returns valid structure", async () => {
  const mockResponse = {
    facts: [{ text: "Apple announced iPhone", category: "operational", confidence: 0.9 }],
  };

  // Mock the provider to return deterministic output
  const result = parseExtractResponse(mockResponse);
  expect(result.facts).toHaveLength(1);
  expect(result.facts[0]).toHaveProperty("text");
  expect(result.facts[0]).toHaveProperty("category");
});
```

### Mock at the Right Boundary

```typescript
// Bad: Testing against real LLM API (slow, expensive, flaky)
test("analyze signal", async () => {
  const result = await analyzeSignal({ rawText: "...", signalId: "1" });
  // Real API call — slow, expensive, non-deterministic
});

// Good: Mock at provider boundary
vi.mock("@/lib/ai/provider", () => ({
  getProvider: () => ({
    completeStructured: vi.fn().mockResolvedValue(mockAnalysisResult),
  }),
}));

test("analyze signal returns result", async () => {
  const result = await analyzeSignal({ rawText: "...", signalId: "1" });
  expect(result.facts).toBeDefined();
  expect(result.sentiment).toBeDefined();
});
```

## Integration Tests

Test pipeline end-to-end with mocked external calls.

```typescript
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { vi } from "vitest";

// Mock HTTP for scraping
const server = setupServer(
  http.get("https://example.com/article", () => {
    return HttpResponse.html("<html><body>Article content</body></html>");
  }),
);

// Mock LLM provider
vi.mock("@/lib/ai/provider", () => ({
  getProvider: () => ({
    completeStructured: vi.fn()
      .mockResolvedValueOnce({ facts: [{ text: "Fact 1", category: "financial", confidence: 0.9 }] })
      .mockResolvedValueOnce({ sentiment: "POSITIVE", confidence: 0.85, reasoning: "Growth", key_phrases: [] })
      .mockResolvedValueOnce({ themes: [{ label: "Growth", evidence: [] }] })
      .mockResolvedValueOnce({ score: 0.88, factors: [], risks: [] }),
  }),
}));

test("full pipeline integration", async () => {
  const result = await processSignal("https://example.com/article");

  expect(result.rawData).toBeDefined();
  expect(result.analysis.facts.length).toBeGreaterThan(0);
  expect(result.analysis.sentiment).toBeDefined();
});
```

## Quick Reference

### Test Types

| Type | What to Test | Mocking | Speed | Cost |
|------|-------------|---------|-------|------|
| Unit | Pure functions (parsing, classification, scoring) | None | Fast | Free |
| LLM unit | Prompt construction, response parsing | Provider | Fast | Free |
| Integration | Pipeline stages end-to-end | HTTP + LLM | Medium | Low |
| Snapshot | LLM output format | LLM responses | Fast | Free |

### What to Mock

- **HTTP requests**: Use MSW (`msw`) for realistic request mocking
- **LLM calls**: Mock `getProvider()` with `vi.mock()`
- **Database**: Use test database or mock Prisma client
- **Time**: Use `vi.useFakeTimers()` for deterministic timestamps

### Testing Checklist

- [ ] Pure functions have unit tests (parsing, classification, scoring)
- [ ] Prompt construction is tested (correct format, includes all data)
- [ ] Response parsing is tested (handles valid and invalid JSON)
- [ ] Error handling is tested (network failures, malformed data)
- [ ] Edge cases are tested (empty input, very long input, special characters)
- [ ] Integration tests verify pipeline flow (scrape → analyze → generate)

## Common Mistakes

### Mistake 1: Testing LLM Output Content

**Bad:**
```typescript
test("extract facts", async () => {
  const result = await extractFacts("Apple announced iPhone");
  expect(result.facts[0].text).toBe("Apple announced iPhone"); // LLM might say "Apple Inc."
});
```

**Good:**
```typescript
test("extract facts structure", () => {
  const mockResponse = { facts: [{ text: "Apple announced...", category: "operational", confidence: 0.9 }] };
  const result = parseExtractResponse(mockResponse);
  expect(result.facts.length).toBeGreaterThan(0);
  expect(result.facts[0]).toHaveProperty("text");
});
```

**Why:** LLM outputs vary; test structure and parsing, not exact content.

### Mistake 2: No Mocking

**Bad:**
```typescript
test("scrape", async () => {
  const result = await scrape("https://real-site.com"); // Live HTTP call
  expect(result.title).toBeDefined();
});
```

**Good:**
```typescript
test("scrape", async () => {
  server.use(http.get("https://real-site.com", () => HttpResponse.html("<html>...</html>")));
  const result = await scrape("https://real-site.com");
  expect(result.title).toBeDefined();
});
```

**Why:** Live calls are slow, expensive, flaky, and can fail for reasons unrelated to your code.

### Mistake 3: Testing Implementation, Not Behavior

**Bad:**
```typescript
test("extract facts calls LLM", async () => {
  const mockComplete = vi.fn().mockResolvedValue('{"facts": [...]}');
  vi.mock("@/lib/ai/provider", () => ({ getProvider: () => ({ complete: mockComplete }) }));

  await extractFacts("text");
  expect(mockComplete).toHaveBeenCalled(); // Tests implementation detail
});
```

**Good:**
```typescript
test("extract facts returns facts", async () => {
  vi.mock("@/lib/ai/provider", () => ({
    getProvider: () => ({ completeStructured: vi.fn().mockResolvedValue({ facts: [...] }) }),
  }));

  const result = await extractFacts("text");
  expect(result.facts.length).toBeGreaterThan(0); // Tests behavior
});
```

**Why:** Implementation changes shouldn't break tests; test what the function does, not how it does it.
