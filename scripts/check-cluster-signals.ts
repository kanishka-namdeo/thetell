/**
 * Debug script to check cluster-signal relationships
 * Run: pnpm tsx scripts/check-cluster-signals.ts
 */

import { prisma } from "@/lib/db";

async function main() {
  console.log("=== Cluster Signal Relationship Analysis ===\n");

  // Get all clusters
  const clusters = await prisma.signalTheme.findMany({
    select: {
      id: true,
      label: true,
      companyId: true,
      status: true,
      _count: {
        select: {
          signals: true,
          clusteredSignals: true,
        },
      },
    },
    orderBy: { lastUpdated: "desc" },
  });

  console.log(`Total clusters: ${clusters.length}\n`);

  // Show clusters with 0 signals in clusteredSignals
  const emptyClusters = clusters.filter((c) => c._count.clusteredSignals === 0);
  console.log(`Clusters with 0 clusteredSignals: ${emptyClusters.length}`);

  if (emptyClusters.length > 0) {
    console.log("\nEmpty clusters (showing first 10):");
    for (const cluster of emptyClusters.slice(0, 10)) {
      console.log(`  - "${cluster.label}" (${cluster.companyId})`);
      console.log(`    signals (many-to-many): ${cluster._count.signals}`);
      console.log(`    clusteredSignals (one-to-many): ${cluster._count.clusteredSignals}`);
    }
  }

  // Show clusters with signals in the many-to-many relationship but not in clusteredSignals
  const mismatchedClusters = clusters.filter(
    (c) => c._count.signals > 0 && c._count.clusteredSignals === 0
  );
  console.log(`\n\nClusters with signals in many-to-many but 0 clusteredSignals: ${mismatchedClusters.length}`);

  if (mismatchedClusters.length > 0) {
    console.log("\nMismatched clusters (showing first 10):");
    for (const cluster of mismatchedClusters.slice(0, 10)) {
      console.log(`  - "${cluster.label}" (${cluster.companyId})`);
      console.log(`    signals (many-to-many): ${cluster._count.signals}`);
      console.log(`    clusteredSignals (one-to-many): ${cluster._count.clusteredSignals}`);
    }
  }

  // Summary
  console.log("\n=== Summary ===");
  console.log(`Total clusters: ${clusters.length}`);
  console.log(`Clusters with 0 clusteredSignals: ${emptyClusters.length}`);
  console.log(`Clusters with mismatched relationships: ${mismatchedClusters.length}`);

  // Check how signals are linked
  console.log("\n=== Signal Link Analysis ===");
  const signalsWithThemes = await prisma.signal.count({
    where: { themes: { some: {} } },
  });
  const signalsWithClusterId = await prisma.signal.count({
    where: { clusterId: { not: null } },
  });
  const totalSignals = await prisma.signal.count();

  console.log(`Total signals: ${totalSignals}`);
  console.log(`Signals linked via themes (many-to-many): ${signalsWithThemes}`);
  console.log(`Signals linked via clusterId (one-to-many): ${signalsWithClusterId}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
