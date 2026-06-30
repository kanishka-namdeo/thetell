/**
 * Show cluster summary with signal counts
 * Run: pnpm tsx scripts/show-cluster-summary.ts
 */

import { prisma } from "@/lib/db";

async function main() {
  console.log("=== Cluster Summary ===\n");

  const clusters = await prisma.signalTheme.findMany({
    orderBy: { lastUpdated: "desc" },
    select: {
      id: true,
      label: true,
      status: true,
      momentum: true,
      company: { select: { name: true } },
      _count: {
        select: {
          signals: true,
          clusteredSignals: true,
        },
      },
    },
  });

  // Group by signal count
  const withSignals = clusters.filter(c => c._count.clusteredSignals > 0);
  const emptyClusters = clusters.filter(c => c._count.clusteredSignals === 0);

  console.log(`Total clusters: ${clusters.length}`);
  console.log(`Clusters with signals (clusteredSignals): ${withSignals.length}`);
  console.log(`Clusters with 0 signals: ${emptyClusters.length}\n`);

  console.log("=== Clusters WITH signals ===\n");
  for (const cluster of withSignals) {
    console.log(`"${cluster.label}" (${cluster.company.name})`);
    console.log(`  Status: ${cluster.status}, Momentum: ${cluster.momentum.toFixed(2)}`);
    console.log(`  Signals (clusteredSignals): ${cluster._count.clusteredSignals}`);
    console.log(`  Thematic links (signals): ${cluster._count.signals}`);
    console.log();
  }

  console.log("\n=== Clusters with 0 signals (showing first 10) ===\n");
  for (const cluster of emptyClusters.slice(0, 10)) {
    console.log(`"${cluster.label}" (${cluster.company.name})`);
    console.log(`  Status: ${cluster.status}, Momentum: ${cluster.momentum.toFixed(2)}`);
    console.log(`  Thematic links (signals): ${cluster._count.signals}`);
    console.log();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
