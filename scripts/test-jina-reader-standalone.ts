/**
 * Standalone Jina Reader test - no database required
 * Tests the self-hosted Jina Reader service directly
 */

const JINA_URL = process.env.JINA_READER_URL || "http://localhost:8081";

// Test URLs with different characteristics
const TEST_URLS = [
  {
    name: "OpenAI Blog (likely static)",
    url: "https://openai.com/blog",
    expected: "fast",
  },
  {
    name: "TechCrunch (JS-heavy)",
    url: "https://techcrunch.com/2024/01/01/",
    expected: "jina",
  },
  {
    name: "Hacker News (simple HTML)",
    url: "https://news.ycombinator.com/",
    expected: "fast",
  },
];

async function testHealthCheck() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 1: Health Check");
  console.log("=".repeat(60));
  console.log(`Jina Reader URL: ${JINA_URL}`);

  try {
    const response = await fetch(JINA_URL, {
      signal: AbortSignal.timeout(5000),
    });
    console.log(`✓ Status: ${response.status} ${response.statusText}`);
    return true;
  } catch (error) {
    console.log(`✗ Health check failed: ${error.message}`);
    return false;
  }
}

async function testJinaReaderDirect() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 2: Direct Jina Reader API");
  console.log("=".repeat(60));

  const testUrl = "https://openai.com/blog";
  console.log(`\nScraping: ${testUrl}`);

  const startTime = Date.now();
  try {
    // Jina Reader endpoint: GET /{url} returns markdown
    const endpoint = `${JINA_URL}/${encodeURIComponent(testUrl)}`;
    const response = await fetch(endpoint, {
      headers: {
        Accept: "text/markdown",
        "User-Agent": "TheTell-Test/1.0",
      },
      signal: AbortSignal.timeout(60000),
    });

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      console.log(`✗ Failed (${elapsed}ms): ${response.status} ${response.statusText}`);
      return;
    }

    const markdown = await response.text();
    console.log(`\n✓ Success (${elapsed}ms)`);
    console.log(`  Content length: ${markdown.length} chars`);
    console.log(`\n  First 500 chars:`);
    console.log(markdown.slice(0, 500).replace(/\n/g, "\n  "));
    console.log(`\n  ... (truncated)`);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.log(`✗ Error (${elapsed}ms): ${error.message}`);
  }
}

async function testAdaptiveFallback() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 3: Adaptive Fallback Simulation");
  console.log("=".repeat(60));

  for (const test of TEST_URLS) {
    console.log(`\n--- ${test.name} ---`);
    console.log(`URL: ${test.url}`);
    console.log(`Expected method: ${test.expected}`);

    // Simulate fast scraper (just fetch raw HTML)
    const fastStart = Date.now();
    let fastContent = "";
    try {
      const response = await fetch(test.url, {
        headers: { "User-Agent": "TheTell-Test/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        const html = await response.text();
        // Extract text from <p> tags (simplified)
        const textMatches = html.match(/<p[^>]*>([^<]+)<\/p>/g) || [];
        fastContent = textMatches
          .map((m) => m.replace(/<[^>]+>/g, "").trim())
          .filter((t) => t.length > 20)
          .join("\n\n");
      }
    } catch (error) {
      console.log(`  Fast scraper error: ${error.message}`);
    }
    const fastElapsed = Date.now() - fastStart;
    console.log(`  Fast: ${fastContent.length} chars (${fastElapsed}ms)`);

    // If fast content is thin, try Jina Reader
    if (fastContent.length < 500) {
      console.log(`  → Fast content too thin, trying Jina Reader...`);

      const jinaStart = Date.now();
      try {
        const endpoint = `${JINA_URL}/${encodeURIComponent(test.url)}`;
        const response = await fetch(endpoint, {
          headers: {
            Accept: "text/markdown",
            "User-Agent": "TheTell-Test/1.0",
          },
          signal: AbortSignal.timeout(60000),
        });

        if (response.ok) {
          const markdown = await response.text();
          const jinaElapsed = Date.now() - jinaStart;
          console.log(`  ✓ Jina: ${markdown.length} chars (${jinaElapsed}ms)`);
          console.log(`  Method used: jina`);
        } else {
          console.log(`  ✗ Jina failed: ${response.status}`);
        }
      } catch (error) {
        const jinaElapsed = Date.now() - jinaStart;
        console.log(`  ✗ Jina error (${jinaElapsed}ms): ${error.message}`);
      }
    } else {
      console.log(`  Method used: fast`);
    }
  }
}

async function main() {
  console.log("Jina Reader Live Test (Standalone)");
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const healthy = await testHealthCheck();
  if (!healthy) {
    console.log("\n✗ Jina Reader is not running. Start it with:");
    console.log("  docker compose up -d jina-reader");
    process.exit(1);
  }

  await testJinaReaderDirect();
  await testAdaptiveFallback();

  console.log("\n" + "=".repeat(60));
  console.log("Tests complete");
  console.log("=".repeat(60));
}

main().catch(console.error);
