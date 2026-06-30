/**
 * Live integration test for the feedsmith-based RSS scraper.
 * Hits REAL RSS feeds, parses them, and writes signals to the local database.
 * No mocks, no simulations.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";
import { RssScraper } from "../src/lib/scraping/rss-scraper";
import { normalizeUrl, computeContentHash } from "../src/lib/scraping/url-normalizer";
import type { SourceType } from "@prisma/client";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/** Well-known feeds that should work for testing */
const TEST_FEEDS: Array<{ url: string; label: string; companySlug: string }> = [
  {
    url: "https://feeds.bbci.co.uk/news/business/rss.xml",
    label: "BBC Business (RSS 2.0)",
    companySlug: "apple",
  },
  {
    url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
    label: "NYT Technology (RSS 2.0)",
    companySlug: "microsoft",
  },
  {
    url: "https://hnrss.org/frontpage",
    label: "Hacker News (RSS 2.0)",
    companySlug: "alphabet",
  },
  {
    url: "https://feeds.arstechnica.com/arstechnica/index",
    label: "Ars Technica (RSS 2.0)",
    companySlug: "nvidia",
  },
  {
    url: "https://techcrunch.com/feed/",
    label: "TechCrunch (RSS 2.0)",
    companySlug: "tesla",
  },
];

async function main() {
  console.log("=== LIVE RSS SCRAPER INTEGRATION TEST ===\n");
  console.log("Testing feedsmith-based RssScraper against real feeds\n");

  // 1. Find a company to attach signals to
  const company = await prisma.company.findFirst({
    where: { slug: { in: TEST_FEEDS.map((f) => f.companySlug) } },
  });

  if (!company) {
    console.error("ERROR: No matching company found in DB. Run seed first.");
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  }

  console.log(`Using company: ${company.name} (${company.id})\n`);

  // 2. Count existing signals before test
  const signalsBefore = await prisma.signal.count();
  console.log(`Signals in DB before test: ${signalsBefore}\n`);

  // 3. Test each feed
  const rssScraper = new RssScraper();
  const summary = {
    feedsTested: 0,
    feedsSucceeded: 0,
    totalItemsFound: 0,
    signalsCreated: 0,
    duplicatesSkipped: 0,
    errors: [] as string[],
    formatsSeen: new Set<string>(),
  };

  for (const feed of TEST_FEEDS) {
    summary.feedsTested++;
    console.log(`\n─── Feed ${summary.feedsTested}: ${feed.label} ───`);
    console.log(`    URL: ${feed.url}`);

    try {
      const startTime = Date.now();
      const result = await rssScraper.scrapeFeed(feed.url);
      const elapsed = Date.now() - startTime;

      if (!result) {
        console.log(`    ❌ FAILED: scraper returned null`);
        summary.errors.push(`${feed.label}: scraper returned null`);
        continue;
      }

      summary.feedsSucceeded++;
      summary.totalItemsFound += result.items.length;

      console.log(`    ✅ Feed title: "${result.title}"`);
      console.log(`    Items: ${result.items.length}`);
      console.log(`    Last build: ${result.lastBuildDate?.toISOString() ?? "N/A"}`);
      console.log(`    Fetch+parse time: ${elapsed}ms`);

      if (result.items.length > 0) {
        console.log(`    First 3 items:`);
        for (const item of result.items.slice(0, 3)) {
          console.log(`      - "${item.title.slice(0, 70)}"`);
          console.log(`        Link: ${item.link}`);
          console.log(`        Date: ${item.pubDate?.toISOString() ?? "N/A"}`);
          if (item.author) console.log(`        Author: ${item.author}`);
        }
      }

      // 4. Create signals in DB for each feed item
      let createdForFeed = 0;
      let dupesForFeed = 0;

      for (const item of result.items.slice(0, 5)) {
        if (!item.link || !item.title) continue;

        const normalizedUrl = normalizeUrl(item.link);
        const content = item.content || item.description || item.title;
        const contentHash = computeContentHash(normalizedUrl, content);

        // Check for existing signal by contentHash
        const existing = await prisma.signal.findUnique({
          where: { contentHash },
        });

        if (existing) {
          dupesForFeed++;
          continue;
        }

        try {
          await prisma.signal.create({
            data: {
              sourceUrl: item.link,
              sourceType: "RSS" as SourceType,
              title: item.title,
              rawContent: content,
              contentHash,
              publishedAt: item.pubDate,
              author: item.author || null,
              companyId: company.id,
              status: "PENDING",
              scraperName: "rss-scraper",
              verified: true,
              dataOrigin: "SCRAPED",
              feedLabel: feed.label,
            },
          });
          createdForFeed++;
        } catch (err: unknown) {
          // P2002 = unique constraint violation (duplicate contentHash)
          if (err instanceof Error && "code" in err && (err as any).code === "P2002") {
            dupesForFeed++;
          } else {
            console.log(`    ⚠️  DB error for "${item.title.slice(0, 40)}": ${(err as Error).message.slice(0, 80)}`);
          }
        }
      }

      summary.signalsCreated += createdForFeed;
      summary.duplicatesSkipped += dupesForFeed;
      console.log(`    DB: ${createdForFeed} signals created, ${dupesForFeed} duplicates skipped`);
    } catch (error) {
      const msg = `${feed.label}: ${(error as Error).message}`;
      console.log(`    ❌ ERROR: ${msg.slice(0, 120)}`);
      summary.errors.push(msg);
    }
  }

  // 5. Count signals after test
  const signalsAfter = await prisma.signal.count();

  // 6. Print summary
  console.log("\n\n═══════════════════════════════════════════");
  console.log("           TEST SUMMARY");
  console.log("═══════════════════════════════════════════");
  console.log(`Feeds tested:       ${summary.feedsTested}`);
  console.log(`Feeds succeeded:    ${summary.feedsSucceeded}`);
  console.log(`Total items found:  ${summary.totalItemsFound}`);
  console.log(`Signals created:    ${summary.signalsCreated}`);
  console.log(`Duplicates skipped: ${summary.duplicatesSkipped}`);
  console.log(`Errors:             ${summary.errors.length}`);
  console.log(`Signals in DB:      ${signalsBefore} → ${signalsAfter} (+${signalsAfter - signalsBefore})`);

  if (summary.errors.length > 0) {
    console.log("\nErrors:");
    for (const err of summary.errors) {
      console.log(`  - ${err.slice(0, 100)}`);
    }
  }

  // 7. Verify created signals
  if (summary.signalsCreated > 0) {
    console.log("\n─── Verifying created signals ───");
    const newSignals = await prisma.signal.findMany({
      where: {
        scraperName: "rss-scraper",
        feedLabel: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        sourceType: true,
        publishedAt: true,
        feedLabel: true,
        rawContent: true,
        createdAt: true,
      },
    });

    for (const sig of newSignals) {
      console.log(`  ✓ [${sig.sourceType}] "${sig.title.slice(0, 60)}"`);
      console.log(`    Feed: ${sig.feedLabel}`);
      console.log(`    URL: ${sig.sourceUrl.slice(0, 80)}`);
      console.log(`    Content length: ${sig.rawContent.length} chars`);
      console.log(`    Published: ${sig.publishedAt?.toISOString() ?? "N/A"}`);
    }
  }

  console.log("\n✅ Live test complete.");

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
