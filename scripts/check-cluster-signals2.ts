/**
 * Debug script to check cluster-signal relationships in detail
 * Run: pnpm tsx scripts/check-cluster-signals2.ts
 */

import { prisma } from "@/lib/db";

async function main() {
  console.log("=== Detailed Cluster Signal Analysis ===\n");

  // Get clusters with signals in many-to-many but not in clusteredSignals
  const clusters = await prisma.signalTheme.findMany({
    where: {
      signals: { some: {} },
    },
    select: {
      id: true,
      label: true,
      companyId: true,
      _count: {
        select: {
          signals: true,
          clusteredSignals: true,
        },
      },
    },
  });

  console.log(`Clusters with signals (many-to-many): ${clusters.length}`);

  // Show mismatched clusters
  const mismatched = clusters.filter(c => c._count.signals !== c._count.clusteredSignals);
  console.log(`Clusters with mismatched counts: ${mismatched.length}\n`);

  for (const cluster of mismatched) {
    console.log(`Cluster: "${cluster.label}"`);
    console.log(`  signals (many-to-many): ${cluster._count.signals}`);
    console.log(`  clusteredSignals (one-to-many): ${cluster._count.clusteredSignals}`);

    // Get the actual signals
    const signals = await prisma.signal.findMany({
      where: { themes: { some: { id: cluster.id } } },
      select: { id: true, title: true, clusterId: true },
    });

    console.log(`  Signal details:`);
    for (const signal of signals) {
      const hasCorrectClusterId = signal.clusterId === cluster.id;
      console.log(`    - ${signal.id.slice(0, 8)}... clusterId=${signal.clusterId?.slice(0, 8) ?? 'null'} ${hasCorrectClusterId ? '✓' : '✗'}`);
    }
    console.log();
  }

  // Check for signals with wrong clusterId
  console.log("\n=== Checking for signals with wrong clusterId ===");
  const allSignals = await prisma.signal.findMany({
    where: { clusterId: { not: null } },
    select: { id: true, clusterId: true, themes: { select: { id: true } } },
  });

  let wrongClusterId = 0;
  for (const signal of allSignals) {
    const themeIds = signal.themes.map(t => t.id);
    if (!themeIds.includes(signal.clusterId!)) {
      wrongClusterId++;
      console.log(`Signal ${signal.id.slice(0, 8)}... has clusterId ${signal.clusterId?.slice(0, 8)}... but themes: [${themeIds.map(id => id.slice(0, 8)).join(', ')}]`);
    }
  }
  console.log(`\nSignals with clusterId not matching any theme: ${wrongClusterId}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
