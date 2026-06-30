/**
 * Check the status of reprocessed wayback signals
 */
import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { prisma } = await import("../src/lib/db");

  console.log("=== Wayback Signal Status Check ===\n");

  // Count by status
  const statusCounts = await prisma.signal.groupBy({
    by: ["status"],
    where: { sourceType: "WEB_ARCHIVE" },
    _count: true,
  });

  console.log("Signal counts by status:");
  for (const { status, _count } of statusCounts) {
    console.log(`  ${status}: ${_count}`);
  }

  // Get analyzed signals with confidence scores
  const analyzedSignals = await prisma.signal.findMany({
    where: { sourceType: "WEB_ARCHIVE", status: "ANALYZED" },
    select: {
      id: true,
      title: true,
      analyses: {
        select: {
          confidence: true,
          sentiment: true,
          agentPersona: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  if (analyzedSignals.length > 0) {
    console.log("\nRecent analyzed signals (last 20):");
    for (const signal of analyzedSignals) {
      const avgConfidence =
        signal.analyses.length > 0
          ? signal.analyses.reduce((sum, a) => sum + a.confidence, 0) /
            signal.analyses.length
          : 0;
      console.log(
        `  - ${signal.title.substring(0, 60)}... (confidence: ${avgConfidence.toFixed(2)})`
      );
    }

    // Overall confidence stats
    const allAnalyses = analyzedSignals.flatMap((s) => s.analyses);
    if (allAnalyses.length > 0) {
      const avgConfidence =
        allAnalyses.reduce((sum, a) => sum + a.confidence, 0) /
        allAnalyses.length;
      const minConfidence = Math.min(
        ...allAnalyses.map((a) => a.confidence)
      );
      const maxConfidence = Math.max(
        ...allAnalyses.map((a) => a.confidence)
      );

      console.log("\nConfidence score statistics:");
      console.log(`  Average: ${avgConfidence.toFixed(3)}`);
      console.log(`  Min: ${minConfidence.toFixed(3)}`);
      console.log(`  Max: ${maxConfidence.toFixed(3)}`);
      console.log(`  Total analyses: ${allAnalyses.length}`);
    }
  }

  // Check for any still failed
  const stillFailed = await prisma.signal.count({
    where: { sourceType: "WEB_ARCHIVE", status: "FAILED" },
  });

  if (stillFailed > 0) {
    console.log(`\n⚠️  ${stillFailed} signals still in FAILED status`);
  } else {
    console.log("\n✓ All signals successfully processed!");
  }

  process.exit(0);
}

main();
