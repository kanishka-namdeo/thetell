/**
 * Script to clean up signal data quality issues identified in the LLM verification report.
 * 
 * Issues addressed:
 * 1. Future-dated publications (temporal anomalies)
 * 2. Missing author attribution
 * 3. Missing metadata (source URLs, institutional affiliations)
 * 4. Content extraction issues (truncation detection)
 * 5. HTML entity decoding in rawContent
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables FIRST
config({ path: resolve(__dirname, "../.env.local") });

interface CleanupStats {
  totalSignals: number;
  futureDatesFixed: number;
  authorsAdded: number;
  metadataAdded: number;
  htmlEntitiesCleaned: number;
  truncationWarnings: number;
  errors: string[];
}

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

async function cleanupSignalData(): Promise<void> {
  console.log("🚀 Starting signal data cleanup...\n");

  // Dynamic imports AFTER environment is loaded
  const cheerio = await import("cheerio");
  const { prisma } = await import("../src/lib/db");
  const { logger } = await import("../src/lib/logger");

  const stats: CleanupStats = {
    totalSignals: 0,
    futureDatesFixed: 0,
    authorsAdded: 0,
    metadataAdded: 0,
    htmlEntitiesCleaned: 0,
    truncationWarnings: 0,
    errors: [],
  };

  try {
    // Get total signal count
    stats.totalSignals = await prisma.signal.count();
    console.log(`Total signals in database: ${stats.totalSignals}`);

    // 1. Fix future-dated publications
    console.log("\n📅 Fixing future-dated publications...");
    const now = new Date();
    const futureSignals = await prisma.signal.findMany({
      where: {
        publishedAt: {
          gt: now,
        },
      },
    });

    console.log(`Found ${futureSignals.length} signals with future dates`);

    for (const signal of futureSignals) {
      try {
        await prisma.signal.update({
          where: { id: signal.id },
          data: {
            publishedAt: signal.scrapedAt,
          },
        });
        stats.futureDatesFixed++;
        console.log(`✓ Fixed future date for signal ${signal.id}`);
      } catch (error) {
        const errorMsg = `Failed to fix date for signal ${signal.id}: ${error}`;
        stats.errors.push(errorMsg);
        console.error(`✗ ${errorMsg}`);
      }
    }

    // 2. Add missing author attribution
    console.log("\n👤 Adding missing author attribution...");
    const signalsWithoutAuthor = await prisma.signal.findMany({
      where: {
        OR: [{ author: null }, { author: "" }],
        sourceType: "BLOG",
      },
      take: 100,
    });

    console.log(`Found ${signalsWithoutAuthor.length} blog signals without authors`);

    for (const signal of signalsWithoutAuthor) {
      try {
        const response = await fetch(signal.sourceUrl, {
          headers: {
            "User-Agent": "TheTell-Bot/1.0 (+https://thetell.example.com/bot; contact@example.com)",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          console.log(`⊘ Could not fetch ${signal.sourceUrl} (HTTP ${response.status})`);
          continue;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Try multiple author selectors
        const authorSelectors = [
          'meta[property="article:author"]',
          'meta[name="author"]',
          '[itemprop="author"] [itemprop="name"]',
          '[itemprop="author"]',
          ".author-name",
          ".byline a",
          ".post-author",
        ];

        let author: string | null = null;
        for (const selector of authorSelectors) {
          const element = $(selector).first();
          if (element.length) {
            author = element.attr("content") || element.find('[itemprop="name"]').first().text().trim() || element.text().trim();
            if (author && author.length > 0 && author.length < 100) {
              break;
            }
            author = null;
          }
        }

        if (author) {
          await prisma.signal.update({
            where: { id: signal.id },
            data: { author },
          });
          stats.authorsAdded++;
          console.log(`✓ Added author "${author}" for signal ${signal.id}`);
        } else {
          console.log(`⊘ No author found for signal ${signal.id}`);
        }

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        const errorMsg = `Failed to fetch author for signal ${signal.id}: ${error}`;
        stats.errors.push(errorMsg);
        console.error(`✗ ${errorMsg}`);
      }
    }

    // 3. Add missing metadata
    console.log("\n🏷️  Adding missing metadata...");
    const allBlogSignals = await prisma.signal.findMany({
      where: {
        sourceType: "BLOG",
      },
      take: 100,
    });
    
    // Filter in code for signals without metadata
    const signalsWithoutMetadata = allBlogSignals.filter(s => !s.metadata);

    console.log(`Found ${signalsWithoutMetadata.length} blog signals without metadata`);

    for (const signal of signalsWithoutMetadata) {
      try {
        const response = await fetch(signal.sourceUrl, {
          headers: {
            "User-Agent": "TheTell-Bot/1.0 (+https://thetell.example.com/bot; contact@example.com)",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          console.log(`⊘ Could not fetch ${signal.sourceUrl} (HTTP ${response.status})`);
          continue;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Extract site name
        const siteNameSelectors = [
          'meta[property="og:site_name"]',
          'meta[name="application-name"]',
          ".site-title",
          ".site-name",
        ];

        let siteName: string | null = null;
        for (const selector of siteNameSelectors) {
          const element = $(selector).first();
          if (element.length) {
            siteName = element.attr("content") || element.text().trim();
            if (siteName && siteName.length > 0 && siteName.length < 100) {
              break;
            }
            siteName = null;
          }
        }

        if (siteName) {
          const metadata = {
            siteName,
            sourceUrl: signal.sourceUrl,
            cleanedAt: new Date().toISOString(),
          };

          await prisma.signal.update({
            where: { id: signal.id },
            data: { metadata },
          });
          stats.metadataAdded++;
          console.log(`✓ Added metadata (site: ${siteName}) for signal ${signal.id}`);
        }

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        const errorMsg = `Failed to fetch metadata for signal ${signal.id}: ${error}`;
        stats.errors.push(errorMsg);
        console.error(`✗ ${errorMsg}`);
      }
    }

    // 4. Detect truncated content
    console.log("\n⚠️  Detecting truncated content...");
    const allSignals = await prisma.signal.findMany({
      select: {
        id: true,
        sourceUrl: true,
        rawContent: true,
        title: true,
      },
      take: 100,
    });

    for (const signal of allSignals) {
      if (signal.rawContent && signal.rawContent.length > 100) {
        const trimmed = signal.rawContent.trim();
        const lastChar = trimmed[trimmed.length - 1];
        const validEndings = [".", "!", "?", ")", "]", '"', "'", "。", "！", "？"];
        
        if (!validEndings.includes(lastChar)) {
          stats.truncationWarnings++;
          console.log(`⚠ Signal ${signal.id} appears truncated: ${signal.sourceUrl}`);
        }
      }
    }

    console.log(`\nFound ${stats.truncationWarnings} signals with potentially truncated content`);

    // 5. Clean HTML entities
    console.log("\n🧹 Cleaning HTML entities from content...");
    const signalsWithEntities = await prisma.signal.findMany({
      where: {
        rawContent: {
          contains: "&#",
        },
      },
      take: 100,
    });

    console.log(`Found ${signalsWithEntities.length} signals with HTML entities`);

    for (const signal of signalsWithEntities) {
      try {
        const cleanedContent = cleanHtmlEntities(signal.rawContent);

        await prisma.signal.update({
          where: { id: signal.id },
          data: { rawContent: cleanedContent },
        });
        stats.htmlEntitiesCleaned++;
        console.log(`✓ Cleaned HTML entities for signal ${signal.id}`);
      } catch (error) {
        const errorMsg = `Failed to clean signal ${signal.id}: ${error}`;
        stats.errors.push(errorMsg);
        console.error(`✗ ${errorMsg}`);
      }
    }

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 CLEANUP SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total signals: ${stats.totalSignals}`);
    console.log(`Future dates fixed: ${stats.futureDatesFixed}`);
    console.log(`Authors added: ${stats.authorsAdded}`);
    console.log(`Metadata added: ${stats.metadataAdded}`);
    console.log(`HTML entities cleaned: ${stats.htmlEntitiesCleaned}`);
    console.log(`Truncation warnings: ${stats.truncationWarnings}`);
    console.log(`Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log("\n❌ ERRORS:");
      stats.errors.forEach((err) => console.log(`  - ${err}`));
    }

    console.log("\n✅ Cleanup complete!");
  } catch (error) {
    console.error("\n❌ Fatal error during cleanup:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupSignalData().catch((error) => {
  console.error("Cleanup failed:", error);
  process.exit(1);
});
