/**
 * Live test: Jina Reader scraper against real URLs
 * Tests the three-tier adaptive fallback chain
 *
 * Usage: pnpm tsx scripts/test-jina-reader.ts
 */

import { JinaReaderScraper } from "../src/lib/scraping/jina-reader-scraper";
import { BlogScraper } from "../src/lib/scraping/blog-scraper";
import { scrapeWithFallback } from "../src/lib/scraping/adaptive-scraper";

// Real URLs that are likely to have JS-rendered content
const TEST_URLS = [
  // JS-heavy news site (likely needs rendering)
  "https://www.reuters.com/technology/",
  // Blog post (usually static, fast scraper should work)
  "https://openai.com/blog",
  // Tech news (may have dynamic content)
  "https://techcrunch.com/2024/01/01/",
];

async function testJinaReaderDirect() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 1: Jina Reader direct scrape");
  console.log("=".repeat(60));

  const jina = new JinaReaderScraper();
  console.log(`Enabled: ${jina.isEnabled()}`);
  console.log(`Scraper name: ${jina.scraperName}`);

  // Test with a single URL first
  const testUrl = "https://openai.com/blog";
  console.log(`\nScraping: ${testUrl}`);

  const startTime = Date.now();
  const article = await jina.scrapeArticle(testUrl);
  const elapsed = Date.now() - startTime;

  if (article) {
    console.log(`\n✓ Success (${elapsed}ms)`);
    console.log(`  Title: ${article.title.slice(0, 80)}`);
    console.log(`  Body length: ${article.bodyText.length} chars`);
    console.log(`  Description: ${article.description.slice(0, 100)}...`);
    console.log(`  Metadata: ${JSON.stringify(article.metadata)}`);
    console.log(`\n  First 500 chars of body:`);
    console.log(`  ${article.bodyText.slice(0, 500).replace(/\n/g, "\n  ")}`);
  } else {
    console.log(`\n✗ Failed (${elapsed}ms) — returned null`);
  }
}

async function testAdaptiveFallback() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 2: Adaptive three-tier fallback");
  console.log("=".repeat(60));

  const blogScraper = new BlogScraper();

  for (const url of TEST_URLS) {
    console.log(`\n--- Testing: ${url} ---`);
    const startTime = Date.now();

    const result = await scrapeWithFallback(url, (u) => blogScraper.scrapeArticle(u));
    const elapsed = Date.now() - startTime;

    console.log(`  Method: ${result.method}`);
    console.log(`  Fast content: ${result.fastContentLength ?? 0} chars`);
    console.log(`  Jina content: ${result.jinaContentLength ?? 0} chars`);
    console.log(`  Stealth content: ${result.stealthContentLength ?? 0} chars`);
    console.log(`  Time: ${elapsed}ms`);

    if (result.article) {
      console.log(`  Title: ${result.article.title?.slice(0, 60) || "(empty)"}`);
      console.log(`  Body: ${result.article.bodyText?.length ?? 0} chars`);
    } else {
      console.log(`  Article: null`);
    }
    if (result.reason) {
      console.log(`  Reason: ${result.reason}`);
    }
  }
}

async function testHealthCheck() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 3: Jina Reader health check");
  console.log("=".repeat(60));

  const readerUrl = process.env.JINA_READER_URL || "http://localhost:8081";
  console.log(`Reader URL: ${readerUrl}`);

  try {
    const response = await fetch(readerUrl, {
      signal: AbortSignal.timeout(5000),
    });
    console.log(`  Status: ${response.status} ${response.statusText}`);
    console.log(`  Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);
  } catch (error) {
    console.log(`  ✗ Health check failed: ${String(error)}`);
    console.log(`  Is Jina Reader running? Try: docker compose up -d jina-reader`);
  }
}

async function main() {
  console.log("Jina Reader Live Test");
  console.log(`JINA_READER_URL=${process.env.JINA_READER_URL || "http://localhost:8081"}`);
  console.log(`JINA_READER_ENABLED=${process.env.JINA_READER_ENABLED || "(not set, defaults to true)"}`);

  await testHealthCheck();
  await testJinaReaderDirect();
  await testAdaptiveFallback();

  console.log("\n" + "=".repeat(60));
  console.log("Tests complete");
  console.log("=".repeat(60));
}

main().catch(console.error);
