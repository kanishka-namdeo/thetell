/**
 * Clean raw HTML content from RSS signals in the database.
 * Converts HTML to clean plain text with paragraph breaks.
 * 
 * Usage: pnpm tsx scripts/clean-rss-signal-content.ts [--dry-run] [--id <signal-id>]
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";
import * as cheerio from "cheerio";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function cleanText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function cleanHtmlToText(html: string): string {
  if (!html || !html.includes("<")) {
    return cleanText(html);
  }

  const $ = cheerio.load(html);

  $(
    "script, style, nav, header, footer, aside, iframe, .ads, .sidebar, .comments, .ad-unit, .share, .social-share, .related-posts"
  ).remove();

  const paragraphs: string[] = [];
  $("p, h1, h2, h3, h4, h5, h6, li, blockquote").each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 0) {
      paragraphs.push(text);
    }
  });

  if (paragraphs.length > 0) {
    return cleanText(paragraphs.join("\n\n"));
  }

  const text = $.text();
  return cleanText(text);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const idIdx = args.indexOf("--id");
  const specificId = idIdx !== -1 ? args[idIdx + 1] : null;

  console.log(dryRun ? "[DRY RUN] No changes will be made.\n" : "[LIVE] Changes will be applied.\n");

  // Find all RSS-scraper signals that contain HTML tags
  const where = specificId
    ? { id: specificId }
    : { scraperName: "rss-scraper" };

  const signals = await prisma.signal.findMany({
    where,
    select: {
      id: true,
      title: true,
      rawContent: true,
      sourceUrl: true,
    },
  });

  console.log(`Found ${signals.length} signals to check.`);

  let cleaned = 0;
  let skipped = 0;
  let failed = 0;

  for (const signal of signals) {
    if (!signal.rawContent) {
      skipped++;
      continue;
    }

    // Check if content contains HTML tags
    const hasHtml = /<[a-z][\s\S]*>/i.test(signal.rawContent);
    if (!hasHtml) {
      skipped++;
      continue;
    }

    const cleanedContent = cleanHtmlToText(signal.rawContent);

    if (cleanedContent === signal.rawContent) {
      skipped++;
      continue;
    }

    console.log(`\n--- Signal: ${signal.id} ---`);
    console.log(`Title: ${signal.title}`);
    console.log(`URL: ${signal.sourceUrl}`);
    console.log(`Before: ${signal.rawContent.length} chars`);
    console.log(`After:  ${cleanedContent.length} chars`);
    console.log(`Preview (first 300 chars):`);
    console.log(cleanedContent.slice(0, 300));
    console.log("...");

    if (!dryRun) {
      try {
        await prisma.signal.update({
          where: { id: signal.id },
          data: { rawContent: cleanedContent },
        });
        cleaned++;
        console.log("✓ Updated");
      } catch (err) {
        failed++;
        console.error(`✗ Failed: ${err}`);
      }
    } else {
      cleaned++;
      console.log("[DRY RUN] Would update");
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total checked: ${signals.length}`);
  console.log(`Cleaned: ${cleaned}`);
  console.log(`Skipped (no HTML): ${skipped}`);
  if (failed > 0) console.log(`Failed: ${failed}`);
  if (dryRun) console.log(`(Dry run — no changes applied)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
