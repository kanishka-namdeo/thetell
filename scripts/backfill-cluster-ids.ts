/**
 * Backfill script to set clusterId on signals that are linked to themes
 * but don't have their clusterId set.
 *
 * Run: pnpm tsx scripts/backfill-cluster-ids.ts
 */

import { prisma } from "@/lib/db";

async function main() {
  console.log("=== Backfilling clusterId for existing signals ===\n");

  // Find all signals that have themes but no clusterId
  const signalsToUpdate = await prisma.signal.findMany({
    where: {
      themes: { some: {} },
      clusterId: null,
    },
    select: {
      id: true,
      title: true,
      themes: {
        select: {
          id: true,
          label: true,
        },
      },
    },
  });

  console.log(`Found ${signalsToUpdate.length} signals to update\n`);

  let updated = 0;
  let failed = 0;

  for (const signal of signalsToUpdate) {
    // Use the first theme as the cluster (signals typically belong to one cluster)
    const primaryTheme = signal.themes[0];
    if (!primaryTheme) continue;

    try {
      await prisma.signal.update({
        where: { id: signal.id },
        data: { clusterId: primaryTheme.id },
      });
      updated++;
      console.log(`✓ Signal "${signal.title.slice(0, 50)}..." → cluster "${primaryTheme.label}"`);
    } catch (err) {
      failed++;
      console.error(`✗ Failed to update signal ${signal.id}:`, err instanceof Error ? err.message : String(err));
    }
  }

  console.log(`\n=== Complete ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);

  // Verify the fix
  console.log("\n=== Verification ===");
  const signalsWithClusterId = await prisma.signal.count({
    where: { clusterId: { not: null } },
  });
  console.log(`Signals with clusterId: ${signalsWithClusterId}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
