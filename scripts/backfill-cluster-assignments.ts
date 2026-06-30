/**
 * Backfill script to link existing signals to clusters.
 *
 * This script finds analyzed signals that have strategic themes
 * and links them to existing SignalTheme clusters based on label similarity.
 *
 * Run with: pnpm tsx scripts/backfill-cluster-assignments.ts
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

async function main() {
  const log = logger.child({ script: "backfill-cluster-assignments" });
  log.info("script.start");

  // Find all analyzed signals without clusterId
  const unclusteredSignals = await prisma.signal.findMany({
    where: {
      status: "ANALYZED",
      clusterId: null,
    },
    include: {
      analyses: {
        select: {
          strategicThemes: true,
        },
      },
    },
    take: 1000,
  });

  log.info("unclustered_signals_found", { count: unclusteredSignals.length });

  // Find all active clusters
  const activeClusters = await prisma.signalTheme.findMany({
    where: {
      status: { in: ["EMERGING", "ACCELERATING", "PEAKED"] },
    },
    select: {
      id: true,
      label: true,
      companyId: true,
    },
  });

  log.info("active_clusters_found", { count: activeClusters.length });

  let linkedCount = 0;
  let skippedCount = 0;

  for (const signal of unclusteredSignals) {
    // Extract strategic themes from analyses
    const allThemes = signal.analyses.flatMap((analysis) => {
      const themes = analysis.strategicThemes;
      if (!Array.isArray(themes)) return [];
      return themes.filter((t): t is { label: string } =>
        typeof t === "object" && t !== null && typeof t.label === "string"
      );
    });

    if (allThemes.length === 0) {
      skippedCount++;
      continue;
    }

    // Find matching cluster for this company
    const companyClusters = activeClusters.filter(
      (cluster) => cluster.companyId === signal.companyId
    );

    if (companyClusters.length === 0) {
      skippedCount++;
      continue;
    }

    // Try to match signal themes to existing clusters using label similarity
    let matchedClusterId: string | null = null;

    for (const theme of allThemes) {
      const themeLabel = theme.label.toLowerCase();

      const matchingCluster = companyClusters.find((cluster) => {
        const clusterLabel = cluster.label.toLowerCase();
        return (
          clusterLabel.includes(themeLabel) ||
          themeLabel.includes(clusterLabel)
        );
      });

      if (matchingCluster) {
        matchedClusterId = matchingCluster.id;
        break;
      }
    }

    if (matchedClusterId) {
      await prisma.signal.update({
        where: { id: signal.id },
        data: { clusterId: matchedClusterId },
      });

      linkedCount++;
      log.debug("signal_linked_to_cluster", {
        signalId: signal.id,
        clusterId: matchedClusterId,
        themesCount: allThemes.length,
      });
    } else {
      skippedCount++;
    }
  }

  log.info("script.complete", {
    totalSignals: unclusteredSignals.length,
    linkedCount,
    skippedCount,
  });

  console.log(`\n✅ Backfill complete:`);
  console.log(`   - Total unclustered signals: ${unclusteredSignals.length}`);
  console.log(`   - Linked to clusters: ${linkedCount}`);
  console.log(`   - Skipped (no match): ${skippedCount}`);
}

main()
  .catch((error) => {
    console.error("❌ Backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
