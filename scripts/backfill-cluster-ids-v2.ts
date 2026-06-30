/**
 * Backfill script to set clusterId on signals that are linked to themes
 * This version properly handles signals belonging to multiple themes by
 * using the cluster that matches the signal's current clusterId (if any)
 * or the first theme if no clusterId is set.
 *
 * Run: pnpm tsx scripts/backfill-cluster-ids-v2.ts
 */

import { prisma } from "@/lib/db";

async function main() {
  console.log("=== Backfilling clusterId for existing signals (v2) ===\n");

  // Find all signals that have themes
  const signalsToUpdate = await prisma.signal.findMany({
    where: {
      themes: { some: {} },
    },
    select: {
      id: true,
      title: true,
      clusterId: true,
      themes: {
        select: {
          id: true,
          label: true,
        },
      },
    },
  });

  console.log(`Found ${signalsToUpdate.length} signals with themes\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const signal of signalsToUpdate) {
    // If signal already has a valid clusterId that matches one of its themes, skip
    if (signal.clusterId) {
      const matchingTheme = signal.themes.find(t => t.id === signal.clusterId);
      if (matchingTheme) {
        skipped++;
        continue;
      }
    }

    // Use the first theme as the cluster
    const primaryTheme = signal.themes[0];
    if (!primaryTheme) {
      console.log(`Signal ${signal.id} has no themes, skipping`);
      continue;
    }

    try {
      await prisma.signal.update({
        where: { id: signal.id },
        data: { clusterId: primaryTheme.id },
      });
      updated++;
      console.log(`✓ Signal "${signal.title.slice(0, 40)}..." → cluster "${primaryTheme.label}"`);
    } catch (err) {
      failed++;
      console.error(`✗ Failed to update signal ${signal.id}:`, err instanceof Error ? err.message : String(err));
    }
  }

  console.log(`\n=== Complete ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (already correct): ${skipped}`);
  console.log(`Failed: ${failed}`);

  // Verify the fix
  console.log("\n=== Verification ===");
  const signalsWithClusterId = await prisma.signal.count({
    where: { clusterId: { not: null } },
  });
  const signalsWithThemes = await prisma.signal.count({
    where: { themes: { some: {} } },
  });
  console.log(`Signals with themes: ${signalsWithThemes}`);
  console.log(`Signals with clusterId: ${signalsWithClusterId}`);

  // Check remaining mismatches
  const mismatched = await prisma.signal.count({
    where: {
      themes: { some: {} },
      clusterId: null,
    },
  });
  console.log(`Signals with themes but no clusterId: ${mismatched}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
