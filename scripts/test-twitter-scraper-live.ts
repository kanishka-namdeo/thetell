/**
 * Live integration test for TwitterScraper against real DB data and live APIs.
 * No mocks - tests actual oEmbed API, fxtwitter, vxtwitter, RSSHub, and syndication endpoints.
 */

import 'dotenv/config';
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from '@prisma/adapter-pg';
import * as pg from 'pg';
import { TwitterScraper } from "@/lib/scraping/twitter-scraper";
import { SocialScraper } from "@/lib/scraping/social-scraper";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const twitterScraper = new TwitterScraper();
const socialScraper = new SocialScraper();

// First, discover a real working tweet by testing fxtwitter with known accounts
async function findWorkingTweet(): Promise<string | null> {
  console.log("\n[0] Discovering a working tweet URL via fxtwitter...\n");

  // Try recent tweets from well-known accounts via fxtwitter
  // fxtwitter returns the latest tweet when given just a username
  const testAccounts = ["OpenAI", "sama", "sataborasu", "elonmusk", "POTUS"];

  for (const account of testAccounts) {
    try {
      const resp = await fetch(`https://api.fxtwitter.com/${account}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) {
        const data = await resp.json() as { tweet?: { url?: string; id?: string; text?: string } };
        if (data.tweet?.url) {
          console.log(`  Found working tweet: ${data.tweet.url}`);
          console.log(`  Text: ${data.tweet.text?.slice(0, 100)}...`);
          return data.tweet.url;
        }
      }
    } catch {
      // continue to next account
    }
  }

  // If no tweet found via account lookup, try a known recent tweet ID
  // Use a very recent, well-known tweet
  const knownRecentTweets = [
    "https://x.com/OpenAI/status/1937866534088991180",
    "https://x.com/sama/status/1937866534088991180",
    "https://twitter.com/POTUS/status/1937866534088991180",
  ];

  for (const tweetUrl of knownRecentTweets) {
    try {
      const resp = await fetch(`https://api.fxtwitter.com/${tweetUrl.replace("https://x.com/", "").replace("https://twitter.com/", "")}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) {
        console.log(`  Found working tweet: ${tweetUrl}`);
        return tweetUrl;
      }
    } catch {
      // continue
    }
  }

  return null;
}

async function main() {
  console.log("=".repeat(70));
  console.log("LIVE TWITTER SCRAPER INTEGRATION TEST");
  console.log("=".repeat(70));

  // ── Step 1: Query DB for existing signals ────────────────────────────
  console.log("\n[1] Querying database for existing signals...\n");

  const counts = await prisma.signal.groupBy({
    by: ["sourceType"],
    _count: { id: true },
  });
  console.log("Signal counts by source type:");
  for (const c of counts) {
    console.log(`  ${c.sourceType}: ${c._count.id}`);
  }

  // Check for any signals with twitter/x URLs
  const xSignals = await prisma.signal.findMany({
    where: {
      OR: [
        { sourceUrl: { contains: "twitter.com" } },
        { sourceUrl: { contains: "x.com" } },
      ],
    },
    select: { id: true, sourceUrl: true, title: true, sourceType: true },
    take: 10,
    orderBy: { createdAt: "desc" },
  });
  console.log(`\nFound ${xSignals.length} signals with twitter/x URLs`);
  for (const s of xSignals) {
    console.log(`  - ${s.sourceUrl?.slice(0, 80)}`);
  }

  // Check for signals that might contain twitter URLs in rawContent
  const signalsWithTwitterContent = await prisma.signal.findMany({
    where: {
      OR: [
        { rawContent: { contains: "twitter.com" } },
        { rawContent: { contains: "x.com" } },
      ],
    },
    select: { id: true, sourceUrl: true, sourceType: true, rawContent: true },
    take: 5,
  });
  console.log(`\nFound ${signalsWithTwitterContent.length} signals with twitter/x in content`);
  for (const s of signalsWithTwitterContent) {
    console.log(`  - [${s.sourceType}] ${s.sourceUrl?.slice(0, 80)}`);
    // Extract twitter URL from rawContent
    const twitterUrlMatch = s.rawContent?.match(/https?:\/\/(?:twitter\.com|x\.com)\/\w+\/status\/\d+/);
    if (twitterUrlMatch) {
      console.log(`    Twitter URL found: ${twitterUrlMatch[0]}`);
    }
  }

  // ── Step 2: Find a working tweet URL ─────────────────────────────────
  const workingTweetUrl = await findWorkingTweet();

  if (!workingTweetUrl) {
    console.log("\n  Could not find a working tweet URL. Testing with a placeholder.");
    console.log("  This is expected if Twitter APIs are rate-limited or unreachable.");
  }

  // ── Step 3: Test all scraper layers ──────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("[2] Testing TwitterScraper layers");
  console.log("=".repeat(70));

  if (workingTweetUrl) {
    console.log(`\n  Scraping: ${workingTweetUrl}`);
    const result = await twitterScraper.scrapeTweet(workingTweetUrl);
    if (result) {
      console.log(`  ✓ SUCCESS (source: ${result.metadata.source})`);
      console.log(`    Author: ${result.author}`);
      console.log(`    Body: ${result.bodyText.slice(0, 150)}...`);
      console.log(`    Published: ${result.publishedAt ?? "N/A"}`);
      console.log(`    Engagement: likes=${result.engagement.likes}, rt=${result.engagement.retweets}, replies=${result.engagement.replies}`);
    } else {
      console.log(`  ✗ FAILED - all layers returned null`);
    }
  } else {
    console.log("\n  Skipping - no working tweet URL found");
  }

  // ── Step 4: Test SocialScraper delegation ────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("[3] Testing SocialScraper delegation to TwitterScraper");
  console.log("=".repeat(70));

  if (workingTweetUrl) {
    console.log(`\n  Scraping via SocialScraper: ${workingTweetUrl}`);
    const socialResult = await socialScraper.scrapePost(workingTweetUrl);
    if (socialResult) {
      console.log(`  ✓ SUCCESS (platform: ${socialResult.platform}, source: ${socialResult.metadata.source})`);
      console.log(`    Author: ${socialResult.author}`);
      console.log(`    Body: ${socialResult.bodyText.slice(0, 150)}...`);
    } else {
      console.log(`  ✗ FAILED`);
    }
  } else {
    console.log("\n  Skipping - no working tweet URL found");
  }

  // ── Step 5: Test RSSHub timeline scraping ────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("[4] Testing Layer 4: RSSHub user timeline");
  console.log("=".repeat(70));

  const rsshubUrl = process.env.RSSHUB_URL || "http://localhost:1200";
  console.log(`\n  RSSHub URL: ${rsshubUrl}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const healthResp = await fetch(`${rsshubUrl}/healthz`, { signal: controller.signal });
    clearTimeout(timeoutId);
    await healthResp.body?.cancel();
    console.log(`  RSSHub health: ${healthResp.ok ? "✓ UP" : "✗ DOWN"}`);
  } catch {
    console.log(`  RSSHub health: ✗ NOT REACHABLE`);
  }

  console.log("\n  Attempting timeline fetch for @OpenAI...");
  const timeline = await twitterScraper.scrapeUserTimeline("OpenAI", 5);
  if (timeline.length > 0) {
    console.log(`  ✓ Got ${timeline.length} tweets from timeline`);
    for (const t of timeline.slice(0, 3)) {
      console.log(`    - [${t.publishedAt?.toISOString() ?? "no date"}] ${t.bodyText.slice(0, 80)}...`);
    }
  } else {
    console.log(`  ✗ No timeline items (RSSHub needs Twitter API credentials)`);
  }

  // ── Step 6: Test re-scraping a DB signal end-to-end ──────────────────
  console.log("\n" + "=".repeat(70));
  console.log("[5] End-to-end: Re-scrape a DB signal through new pipeline");
  console.log("=".repeat(70));

  if (xSignals.length > 0) {
    const dbSignal = xSignals[0];
    console.log(`\n  DB signal: ${dbSignal.sourceUrl}`);
    const rescraped = await socialScraper.scrapePost(dbSignal.sourceUrl!);
    if (rescraped) {
      console.log(`  ✓ Re-scraped successfully`);
      console.log(`    Author: ${rescraped.author}`);
      console.log(`    Body: ${rescraped.bodyText.slice(0, 150)}...`);
      console.log(`    Source: ${rescraped.metadata.source}`);
    } else {
      console.log(`  ✗ Re-scrape returned null`);
    }
  } else {
    console.log("\n  No Twitter/X signals in DB to re-scrape.");
    if (workingTweetUrl) {
      console.log("  Testing with discovered tweet instead...");
      const result = await socialScraper.scrapePost(workingTweetUrl);
      console.log(`  Result: ${result ? "✓ SUCCESS" : "✗ FAILED"}`);
      if (result) {
        console.log(`    Author: ${result.author}`);
        console.log(`    Source: ${result.metadata.source}`);
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("TEST COMPLETE");
  console.log("=".repeat(70));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Test failed:", e);
  prisma.$disconnect();
  process.exit(1);
});
