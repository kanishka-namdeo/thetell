/**
 * Backfill script: Re-scrape blocked Tesla signals using stealth browser.
 * 
 * Targets 4 signals that were blocked by HTTP scrapers and updates them
 * with full content fetched via CloakBrowser stealth scraping.
 * 
 * Usage:
 *   pnpm tsx scripts/rescrape-with-stealth.ts
 *   pnpm tsx scripts/rescrape-with-stealth.ts --dry-run
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { StealthBrowserScraper } = await import(
    "../src/lib/scraping/stealth-browser-scraper"
  );
  const { logger } = await import("../src/lib/logger");

  const dryRun = process.argv.includes("--dry-run");
  const log = logger.child({ script: "rescrape-with-stealth" });

  const TARGET_SIGNAL_IDS = [
    "cmqt4tr9r00089gln1mgylsrp",
    "cmqt4tra100099gln0fcl3jvn",
    "cmqt4tra9000a9glnty5uod86",
    "cmqt4trag000b9gln7865v71a",
  ];

  log.info("backfill.start", {
    signalCount: TARGET_SIGNAL_IDS.length,
    dryRun,
  });

  const stealthScraper = new StealthBrowserScraper();

  if (!stealthScraper.isEnabled()) {
    log.error("backfill.stealth_disabled", {
      message:
        "STEALTH_SCRAPER_ENABLED is set to false. Enable it to run this script.",
    });
    process.exit(1);
  }

  const results = {
    total: TARGET_SIGNAL_IDS.length,
    updated: 0,
    failed: 0,
    skipped: 0,
  };

  for (const signalId of TARGET_SIGNAL_IDS) {
    const stepLog = logger.child({ script: "rescrape-with-stealth", signalId });

    try {
      const signal = await prisma.signal.findUnique({
        where: { id: signalId },
      });

      if (!signal) {
        stepLog.warn("backfill.signal_not_found");
        results.skipped++;
        continue;
      }

      stepLog.info("backfill.signal_found", {
        url: signal.sourceUrl,
        currentContentLength: signal.rawContent?.length || 0,
        title: signal.title,
      });

      if (dryRun) {
        stepLog.info("backfill.dry_run_skip");
        results.skipped++;
        continue;
      }

      const startTime = Date.now();
      const article = await stealthScraper.scrapeArticle(signal.sourceUrl);
      const elapsed = Date.now() - startTime;

      if (!article) {
        stepLog.error("backfill.stealth_failed", {
          url: signal.sourceUrl,
          timeMs: elapsed,
        });
        results.failed++;
        continue;
      }

      const contentLength = article.bodyText.length;

      if (contentLength < 500) {
        stepLog.warn("backfill.content_too_short", {
          url: signal.sourceUrl,
          contentLength,
          timeMs: elapsed,
        });
        results.failed++;
        continue;
      }

      await prisma.signal.update({
        where: { id: signalId },
        data: {
          rawContent: article.bodyText,
          title: article.title || signal.title,
          author: article.author || signal.author,
          publishedAt: article.publishedAt || signal.publishedAt,
          scraperName: "stealth-browser",
          metadata: {
            ...(typeof signal.metadata === "object" && signal.metadata !== null
              ? (signal.metadata as Record<string, unknown>)
              : {}),
            rescrapeSource: "stealth-browser",
            rescrapedAt: new Date().toISOString(),
            previousContentLength: signal.rawContent?.length || 0,
            newContentLength: contentLength,
          },
        },
      });

      stepLog.info("backfill.success", {
        url: signal.sourceUrl,
        contentLength,
        previousLength: signal.rawContent?.length || 0,
        timeMs: elapsed,
        title: article.title,
      });

      results.updated++;
    } catch (error) {
      stepLog.error("backfill.error", { error: String(error) });
      results.failed++;
    }
  }

  log.info("backfill.complete", results);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Backfill fatal error:", error);
  process.exit(1);
});
