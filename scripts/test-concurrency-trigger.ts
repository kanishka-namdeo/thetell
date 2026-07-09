import "dotenv/config";

// Set dev mode for Inngest
process.env.INNGEST_DEV = "1";

async function main() {
  const { inngest } = await import("../src/lib/inngest/client");
  const { prisma } = await import("../src/lib/db");
  console.log("=== Concurrency Limit Test ===\n");

  // Check current state
  const statusCounts = await prisma.signal.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("Current signal status:");
  statusCounts.forEach((s) => console.log(`  ${s.status}: ${s._count}`));

  // Get PENDING signals
  const pending = await prisma.signal.findMany({
    where: { status: "PENDING" },
    select: { id: true, title: true },
    take: 5,
  });

  console.log(`\nFound ${pending.length} PENDING signals to trigger:`);
  pending.forEach((s) => console.log(`  ${s.id}: ${s.title?.substring(0, 50)}`));

  if (pending.length === 0) {
    console.log("\nNo PENDING signals. Checking for stale ANALYZING...");
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
    const stale = await prisma.signal.findMany({
      where: { status: "ANALYZING", updatedAt: { lt: staleThreshold } },
      select: { id: true, title: true },
      take: 5,
    });
    console.log(`Found ${stale.length} stale ANALYZING signals`);
    stale.forEach((s) => console.log(`  ${s.id}: ${s.title?.substring(0, 50)}`));
    
    if (stale.length === 0) {
      console.log("Nothing to trigger.");
      await prisma.$disconnect();
      return;
    }
  }

  // Trigger analysis for PENDING signals
  const signalsToTrigger = pending.length > 0 ? pending : [];
  
  console.log(`\nTriggering ${signalsToTrigger.length} signal/analysis.requested events...`);
  
  for (const signal of signalsToTrigger) {
    await inngest.send({
      name: "signal/analysis.requested",
      data: {
        signalId: signal.id,
        jobId: "concurrency-test",
        triggeredBy: "test-script",
        triggeredAt: new Date().toISOString(),
      },
    });
    console.log(`  Sent event for ${signal.id}`);
  }

  console.log("\nDone! Check Inngest dashboard at http://localhost:8288");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
