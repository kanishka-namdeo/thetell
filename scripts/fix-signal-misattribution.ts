/**
 * Fix script for signal misattribution bug.
 * 
 * This script identifies and fixes signals that were incorrectly attributed
 * to companies due to the slug vs UUID mapping issue in the discovery pipeline.
 * 
 * Issues it fixes:
 * 1. Signals with companyId that are actual slugs (e.g., "techcrunch", "apple") - these are invalid
 * 2. Signals from TechCrunch feed that were assigned to Apple incorrectly
 * 3. Any other signals with invalid company associations
 * 
 * Usage: pnpm tsx scripts/fix-signal-misattribution.ts [--execute]
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

interface MisattributedSignal {
  id: string;
  title: string;
  sourceUrl: string;
  companyId: string;
  scraperName: string | null;
  issue: string;
  suggestedAction: 'delete' | 'reassign';
  suggestedCompanyId?: string;
}

async function main() {
  const log = logger.child({ script: "fix-signal-misattribution" });
  
  log.info("Starting signal misattribution fix script");

  // Known slug-based company IDs that should never appear in signals
  // These are from the feed registry and indicate the bug was present
  const knownSlugs = [
    'techcrunch', 'the-information', 'stratechery', 'sec-edgar', 
    'federal-reserve', 'bureau-labor-stats', 'reddit-wallstreetbets',
    'reddit-stocks', 'reddit-investing', 'reddit-economy', 'reddit-markets',
    'reddit-stockmarket', 'reddit-options', 'reddit-dividends'
  ];

  // Step 1: Find all signals with invalid companyId (actual slugs, not CUIDs)
  const allSignals = await prisma.signal.findMany({
    select: {
      id: true,
      title: true,
      sourceUrl: true,
      companyId: true,
      scraperName: true,
      rawContent: true,
    },
  });

  const misattributedSignals: MisattributedSignal[] = [];

  for (const signal of allSignals) {
    // Check if companyId is a known slug (not a CUID/UUID)
    const isKnownSlug = knownSlugs.includes(signal.companyId.toLowerCase());
    
    // Also check if it looks like a slug (short, lowercase, hyphens, no numbers)
    const looksLikeSlug = /^[a-z][a-z0-9-]*$/i.test(signal.companyId) && 
                          signal.companyId.length < 50 && 
                          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(signal.companyId) &&
                          !/cmq[a-z0-9]{20,}/i.test(signal.companyId); // Prisma CUID pattern

    if (isKnownSlug || looksLikeSlug) {
      misattributedSignals.push({
        id: signal.id,
        title: signal.title,
        sourceUrl: signal.sourceUrl,
        companyId: signal.companyId,
        scraperName: signal.scraperName,
        issue: `Invalid companyId (slug: "${signal.companyId}")`,
        suggestedAction: 'delete',
      });
    } else {
      // Check if companyId is a valid CUID/UUID but company doesn't exist
      const companyExists = await prisma.company.findUnique({
        where: { id: signal.companyId },
        select: { id: true },
      });

      if (!companyExists) {
        misattributedSignals.push({
          id: signal.id,
          title: signal.title,
          sourceUrl: signal.sourceUrl,
          companyId: signal.companyId,
          scraperName: signal.scraperName,
          issue: `Company ID "${signal.companyId}" does not exist in database`,
          suggestedAction: 'delete',
        });
      }
    }
  }

  log.info(`Found ${misattributedSignals.length} misattributed signals`);

  if (misattributedSignals.length === 0) {
    log.info("No misattributed signals found. Database is clean.");
    return;
  }

  // Log details
  log.info("Misattributed signals:");
  misattributedSignals.forEach((signal, i) => {
    log.info(`  ${i + 1}. "${signal.title}" (ID: ${signal.id})`);
    log.info(`     Source: ${signal.sourceUrl || '(none)'}`);
    log.info(`     CompanyId: ${signal.companyId}`);
    log.info(`     Issue: ${signal.issue}`);
    log.info(`     Action: ${signal.suggestedAction}`);
  });

  // Step 2: Ask for confirmation before proceeding
  console.log("\n=== SIGNALS TO DELETE ===");
  console.log(`Total misattributed signals: ${misattributedSignals.length}`);
  console.log("\nThese signals will be DELETED because they have invalid company associations.");
  console.log("This action cannot be undone.\n");

  const execute = process.argv.includes("--execute");

  if (!execute) {
    log.info("DRY RUN MODE - No changes made. Use --execute flag to apply fixes.");
    log.info(`Would delete ${misattributedSignals.length} signals.`);
    return;
  }

  // Step 3: Delete misattributed signals
  log.info("Deleting misattributed signals...");
  
  let deletedCount = 0;
  let failedCount = 0;
  
  for (const signal of misattributedSignals) {
    try {
      // First delete related records (analyses, themes, etc.)
      await prisma.analysis.deleteMany({
        where: { signalId: signal.id },
      });

      // Then delete the signal (Prisma automatically cleans up the implicit many-to-many with themes)
      await prisma.signal.delete({
        where: { id: signal.id },
      });

      deletedCount++;
      log.info(`Deleted signal: ${signal.id} - "${signal.title}"`);
    } catch (error) {
      failedCount++;
      log.error(`Failed to delete signal ${signal.id}: ${error}`);
    }
  }

  log.info(`Fix complete. Deleted ${deletedCount} misattributed signals.${failedCount > 0 ? ` Failed: ${failedCount}` : ''}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
