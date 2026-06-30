/**
 * Manually trigger the correlation (clustering) pipeline and report results.
 *
 * Usage: pnpm tsx scripts/test-correlation.ts
 */

import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });
  const { prisma } = await import("../src/lib/db");

  console.log("\n=== Correlation pre-check ===\n");

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [totalAnalyses, recentAnalyses, totalSignals, totalCompanies, totalThemes, totalInferences, totalClusterArticles] =
    await Promise.all([
      prisma.analysis.count(),
      prisma.analysis.count({
        where: {
          analyzedAt: { gte: sevenDaysAgo },
          confidence: { gte: 0.5 },
        },
      }),
      prisma.signal.count(),
      prisma.company.count(),
      prisma.signalTheme.count(),
      prisma.inference.count(),
      prisma.clusterArticle.count(),
    ]);

  console.log("Total signals:              ", totalSignals);
  console.log("Total companies:            ", totalCompanies);
  console.log("Total analyses (all time):  ", totalAnalyses);
  console.log("Recent analyses (7d, c>=0.5):", recentAnalyses);
  console.log("Existing SignalThemes:      ", totalThemes);
  console.log("Existing Inferences:        ", totalInferences);
  console.log("Existing ClusterArticles:   ", totalClusterArticles);

  // Check if recent analyses have strategic themes
  const recentWithThemes = await prisma.analysis.findMany({
    where: {
      analyzedAt: { gte: sevenDaysAgo },
      confidence: { gte: 0.5 },
    },
    select: {
      id: true,
      strategicThemes: true,
      signal: {
        select: {
          sourceType: true,
          companyId: true,
        },
      },
    },
    take: 10,
  });

  let totalThemeCount = 0;
  const uniqueThemes = new Set<string>();
  
  console.log("\n=== Sample analyses with themes ===\n");
  for (const a of recentWithThemes) {
    const themes = Array.isArray(a.strategicThemes) ? a.strategicThemes : [];
    totalThemeCount += themes.length;
    themes.forEach((t: any) => {
      if (t.label) uniqueThemes.add(t.label);
    });
    
    if (themes.length > 0) {
      console.log(`  Analysis ${a.id.substring(0, 8)}... (${a.signal.sourceType})`);
      console.log(`    Themes: ${themes.map((t: any) => t.label).join(", ")}`);
    }
  }

  console.log(`\nTotal themes in sample: ${totalThemeCount}`);
  console.log(`Unique theme labels: ${uniqueThemes.size}`);
  console.log(`Sample themes: ${Array.from(uniqueThemes).slice(0, 5).join(", ")}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
