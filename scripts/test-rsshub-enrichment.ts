/**
 * End-to-end test for RSSHub feed integration.
 * Tests feed generation against real companies in the DB,
 * then attempts to fetch a sample of each feed type.
 */
import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { generateRsshubFeeds, generateGlobalRsshubFeeds } = await import("../src/lib/scraping/rsshub-feed-generator");
  const { prisma } = await import("../src/lib/db");

  console.log("=== RSSHub Feed Integration Test ===\n");

  // 1. Test global feeds
  console.log("--- Global Feeds ---");
  const globalFeeds = generateGlobalRsshubFeeds();
  console.log(`Generated ${globalFeeds.length} global feeds:`);
  for (const feed of globalFeeds) {
    console.log(`  [${feed.sourceType}] ${feed.label}: ${feed.url}`);
  }

  // 2. Get companies from DB
  const companies = await prisma.company.findMany({ take: 5 });
  console.log(`\n--- Company Feeds (${companies.length} companies) ---`);

  const allTestedUrls = new Map<string, { label: string; status: string }>();

  for (const company of companies) {
    console.log(`\n=== ${company.name} (${company.ticker || "no ticker"}, ${company.sector || "no sector"}) ===`);
    const feeds = generateRsshubFeeds({
      name: company.name,
      ticker: company.ticker,
      sector: company.sector,
      slug: company.slug,
    });
    console.log(`Generated ${feeds.length} feeds`);

    // Test first 3 feeds per company to avoid hammering servers
    for (const feed of feeds.slice(0, 3)) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const resp = await fetch(feed.url, {
          signal: controller.signal,
          headers: { "User-Agent": "TheTell-Bot/1.0 (+https://thetell.example.com/bot; contact@example.com)" },
        });
        clearTimeout(timeout);
        const status = `HTTP ${resp.status}`;
        console.log(`  ✓ [${feed.sourceType}] ${feed.label}: ${status}`);
        allTestedUrls.set(feed.url, { label: feed.label, status });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ✗ [${feed.sourceType}] ${feed.label}: ERROR ${msg}`);
        allTestedUrls.set(feed.url, { label: feed.label, status: `ERROR: ${msg}` });
      }
    }
  }

  // 3. Test SEC EDGAR per-company feed
  console.log("\n--- SEC EDGAR Per-Company Feed ---");
  const secUrl = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193&type=8-K&count=40&output=atom";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(secUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "TheTell-Bot/1.0 (+https://thetell.example.com/bot; contact@example.com)" },
    });
    clearTimeout(timeout);
    console.log(`  ✓ SEC EDGAR 8-K (Apple): HTTP ${resp.status}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ SEC EDGAR 8-K (Apple): ERROR ${msg}`);
  }

  // 4. Test Wikipedia feed
  console.log("\n--- Wikipedia Feed ---");
  const wikiUrl = "https://en.wikipedia.org/w/index.php?title=Apple_Inc.&action=history&feed=rss";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(wikiUrl, { signal: controller.signal });
    clearTimeout(timeout);
    console.log(`  ✓ Wikipedia Apple Inc.: HTTP ${resp.status}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ Wikipedia Apple Inc.: ERROR ${msg}`);
  }

  // 5. Summary
  console.log("\n=== Summary ===");
  const successes = [...allTestedUrls.values()].filter((v) => v.status.startsWith("HTTP 2"));
  const failures = [...allTestedUrls.values()].filter((v) => !v.status.startsWith("HTTP 2"));
  console.log(`Total tested: ${allTestedUrls.size}`);
  console.log(`Successes: ${successes.length}`);
  console.log(`Failures: ${failures.length}`);
  if (failures.length > 0) {
    console.log("\nFailed feeds:");
    for (const f of failures) {
      console.log(`  - ${f.label}: ${f.status}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
