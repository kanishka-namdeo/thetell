/**
 * Directly analyze PENDING wayback signals using the analysis router.
 * This bypasses the discovery pipeline and processes existing signals.
 */
import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { prisma } = await import("../src/lib/db");
  const { analyzeSignalWithTriage } = await import("../src/lib/ai/agent/analysis-router");

  console.log("=== Analyze Pending Wayback Signals ===\n");

  // Get all PENDING wayback signals
  const pendingSignals = await prisma.signal.findMany({
    where: { sourceType: "WEB_ARCHIVE", status: "PENDING" },
    select: { id: true, title: true, companyId: true },
  });

  console.log(`Found ${pendingSignals.length} PENDING wayback signals\n`);

  if (pendingSignals.length === 0) {
    console.log("No pending signals to analyze. Exiting.");
    process.exit(0);
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < pendingSignals.length; i++) {
    const signal = pendingSignals[i];
    const progress = `[${i + 1}/${pendingSignals.length}]`;
    
    try {
      console.log(`${progress} Analyzing: ${signal.title.substring(0, 60)}...`);
      
      // Mark as analyzing
      await prisma.signal.update({
        where: { id: signal.id },
        data: { status: "ANALYZING" },
      });

      // Run analysis
      await analyzeSignalWithTriage(signal.id);

      // Mark as analyzed
      await prisma.signal.update({
        where: { id: signal.id },
        data: { status: "ANALYZED" },
      });

      successCount++;
      console.log(`${progress} ✓ Successfully analyzed\n`);
    } catch (error) {
      failCount++;
      console.error(`${progress} ✗ Failed:`, error instanceof Error ? error.message : error);
      
      // Mark as failed
      await prisma.signal.update({
        where: { id: signal.id },
        data: { status: "FAILED" },
      });
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Total processed: ${pendingSignals.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failCount}`);

  // Show confidence scores for newly analyzed signals
  const analyzedSignals = await prisma.signal.findMany({
    where: { 
      sourceType: "WEB_ARCHIVE", 
      status: "ANALYZED",
      id: { in: pendingSignals.map(s => s.id) }
    },
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
  });

  if (analyzedSignals.length > 0) {
    console.log("\n=== Confidence Scores ===");
    const allAnalyses = analyzedSignals.flatMap((s) => s.analyses);
    
    if (allAnalyses.length > 0) {
      const avgConfidence =
        allAnalyses.reduce((sum, a) => sum + a.confidence, 0) /
        allAnalyses.length;
      const minConfidence = Math.min(...allAnalyses.map((a) => a.confidence));
      const maxConfidence = Math.max(...allAnalyses.map((a) => a.confidence));

      console.log(`Average: ${avgConfidence.toFixed(3)}`);
      console.log(`Min: ${minConfidence.toFixed(3)}`);
      console.log(`Max: ${maxConfidence.toFixed(3)}`);
      console.log(`Total analyses: ${allAnalyses.length}`);
    }
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
