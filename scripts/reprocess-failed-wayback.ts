/**
 * Re-process FAILED wayback signals by resetting them to PENDING
 * and triggering the wayback discovery pipeline.
 */
import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { prisma } = await import("../src/lib/db");
  const { inngest } = await import("../src/lib/inngest/client");

  console.log("=== Re-Process Failed Wayback Signals ===\n");

  // 1. Count failed wayback signals
  const failedCount = await prisma.signal.count({
    where: { sourceType: "WEB_ARCHIVE", status: "FAILED" },
  });
  console.log(`Found ${failedCount} FAILED wayback signals`);

  if (failedCount === 0) {
    console.log("No failed signals to reprocess. Exiting.");
    process.exit(0);
  }

  // 2. Get the failed signal IDs for reporting
  const failedSignals = await prisma.signal.findMany({
    where: { sourceType: "WEB_ARCHIVE", status: "FAILED" },
    select: { id: true, title: true, companyId: true },
  });

  const companyIds = [...new Set(failedSignals.map((s) => s.companyId))];
  console.log(`Across ${companyIds.length} companies\n`);

  // 3. Delete any existing analyses for these signals (partial/failed)
  const signalIds = failedSignals.map((s) => s.id);
  const deletedAnalyses = await prisma.analysis.deleteMany({
    where: { signalId: { in: signalIds } },
  });
  console.log(`Deleted ${deletedAnalyses.count} existing analyses`);

  // 4. Reset signal status to PENDING
  const updated = await prisma.signal.updateMany({
    where: { sourceType: "WEB_ARCHIVE", status: "FAILED" },
    data: { status: "PENDING" },
  });
  console.log(`Reset ${updated.count} signals to PENDING status\n`);

  // 5. Trigger wayback discovery pipeline
  console.log("Triggering wayback discovery pipeline...");
  try {
    await inngest.send({
      name: "signal/discovery.requested",
      data: {
        companyIds,
        scrapers: ["wayback"],
        mode: "manual",
        hypothesisAware: false,
        stealthFallback: false,
      },
    });
    console.log("✓ Wayback discovery job triggered successfully\n");
  } catch (error) {
    console.error("✗ Failed to trigger discovery:", error);
    console.log("\nSignals have been reset to PENDING. You can trigger the pipeline manually later.");
    process.exit(1);
  }

  console.log("Monitor progress at:");
  console.log("  - Inngest dashboard: http://localhost:8288");
  console.log("  - Dev server logs: terminal running pnpm dev");
  console.log(`\nReprocessing ${updated.count} signals across ${companyIds.length} companies`);

  process.exit(0);
}

main();
