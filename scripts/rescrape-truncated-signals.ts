/**
 * Re-scrape truncated signals with improved content extraction.
 * Uses BlogScraper to fetch full page content instead of RSS descriptions.
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });

async function rescapeTruncatedSignals() {
  console.log("🔄 Starting re-scrape of truncated signals...\n");

  const { prisma } = await import("../src/lib/db");
  const { BlogScraper } = await import("../src/lib/scraping/blog-scraper");

  // Local HTML entity cleaner (avoid importing cleanup script which runs on import)
  function cleanHtmlEntities(text: string): string {
    return text
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/&#8211;/g, "–")
      .replace(/&#8212;/g, "—")
      .replace(/&#8230;/g, "…")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, " ");
  }

  const truncatedSignalIds = [
    "cmqt4tr9r00089gln1mgylsrp",
    "cmqt4tra100099gln0fcl3jvn",
    "cmqt4tra9000a9glnty5uod86",
    "cmqt4trag000b9gln7865v71a",
    "cmqt4tuz5000n9gln4hj0e9sc",
    "cmqt4tvo9000p9gln6gx7emhc",
    "cmqt4tx5i000t9glnwq7daiq0",
    "cmqt4txxy000v9glnvvgf9loj",
  ];

  const blogScraper = new BlogScraper();
  const stats = {
    total: truncatedSignalIds.length,
    success: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const signalId of truncatedSignalIds) {
    try {
      console.log(`\n📄 Processing signal ${signalId}...`);

      // Get the signal from database
      const signal = await prisma.signal.findUnique({
        where: { id: signalId },
      });

      if (!signal) {
        console.log(`  ❌ Signal not found`);
        stats.failed++;
        continue;
      }

      console.log(`  URL: ${signal.sourceUrl}`);
      console.log(`  Current content length: ${signal.rawContent.length}`);

      // Re-scrape using BlogScraper
      const scraped = await blogScraper.scrapeArticle(signal.sourceUrl);

      if (!scraped) {
        console.log(`  ❌ Failed to scrape`);
        stats.failed++;
        stats.errors.push(`Failed to scrape: ${signal.sourceUrl}`);
        continue;
      }

      // Clean the content
      let cleanedContent = scraped.bodyText;

      // Remove JavaScript code blocks
      cleanedContent = cleanedContent.replace(
        /\/\*[\s\S]*?\*\/|\/\/.*/g,
        ""
      );
      cleanedContent = cleanedContent.replace(
        /ga\(['"].*?['"]\);?/g,
        ""
      );
      cleanedContent = cleanedContent.replace(
        /function\s+\w+\s*\([^)]*\)\s*\{[^}]*\}/g,
        ""
      );
      cleanedContent = cleanedContent.replace(
        /if\s*\([^)]*\)\s*\{[^}]*\}/g,
        ""
      );

      // Remove common tracking code patterns
      cleanedContent = cleanedContent.replace(
        /window\.[\w.]+\s*=\s*[^;]+;/g,
        ""
      );
      cleanedContent = cleanedContent.replace(
        /document\.[\w.]+\s*[\(\=][^;]+;/g,
        ""
      );

      // Clean HTML entities
      cleanedContent = cleanHtmlEntities(cleanedContent);

      // Remove excessive whitespace
      cleanedContent = cleanedContent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join("\n\n");

      // Check if content is actually better
      if (cleanedContent.length < 100) {
        console.log(
          `  ⚠️  Scraped content too short (${cleanedContent.length} chars), keeping original`
        );
        stats.failed++;
        continue;
      }

      // Check if content ends properly
      const lastChar = cleanedContent.trim().slice(-1);
      const validEndings = [".", "!", "?", '"', "'", ")", "]"];
      const endsProperly = validEndings.includes(lastChar);

      console.log(`  New content length: ${cleanedContent.length}`);
      console.log(`  Ends properly: ${endsProperly ? "✅" : "⚠️"}`);

      // Update the signal
      await prisma.signal.update({
        where: { id: signalId },
        data: {
          rawContent: cleanedContent,
          // Update author if we got a better one
          author: scraped.author || signal.author,
          // Update metadata with scrape info
          metadata: {
            ...(signal.metadata as any),
            rescrapedAt: new Date().toISOString(),
            rescrapeSource: "blog-scraper",
            contentImproved: true,
          },
        },
      });

      console.log(`  ✅ Successfully updated`);
      stats.success++;

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
      console.error(`  ❌ Error: ${error}`);
      stats.failed++;
      stats.errors.push(`Error processing ${signalId}: ${error}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 RE-SCRAPE SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total signals: ${stats.total}`);
  console.log(`Successful: ${stats.success}`);
  console.log(`Failed: ${stats.failed}`);

  if (stats.errors.length > 0) {
    console.log("\n❌ ERRORS:");
    stats.errors.forEach((err) => console.log(`  - ${err}`));
  }

  console.log("\n✅ Re-scrape complete!");

  await prisma.$disconnect();
}

rescapeTruncatedSignals().catch((error) => {
  console.error("Re-scrape failed:", error);
  process.exit(1);
});
