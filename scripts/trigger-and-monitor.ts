import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { inngest } from "@/lib/inngest/client";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Triggering Analysis for 5 PENDING Signals ===\n");

  // Get 5 PENDING signals
  const signals = await prisma.signal.findMany({
    where: { status: "PENDING" },
    take: 5,
    select: { id: true, title: true, status: true },
  });

  console.log(`Found ${signals.length} PENDING signals to analyze:`);
  signals.forEach((s) => {
    console.log(`  - ${s.id}: ${s.title.substring(0, 50)}...`);
  });

  // Trigger analysis for each signal
  console.log("\nTriggering analysis events...");
  const jobId = crypto.randomUUID();
  
  for (const signal of signals) {
    try {
      await inngest.send({
        name: "signal/analysis.requested",
        data: {
          signalId: signal.id,
          jobId,
          triggeredBy: "test-script",
          triggeredAt: new Date().toISOString(),
        },
      });
      console.log(`  ✓ Queued ${signal.id}`);
    } catch (error) {
      console.log(`  ✗ Failed to queue ${signal.id}: ${error}`);
    }
  }

  console.log("\n=== Monitoring Progress ===");
  console.log("Checking status every 10 seconds for 2 minutes...\n");

  const startTime = Date.now();
  const duration = 120000; // 2 minutes
  const interval = 10000; // 10 seconds

  while (Date.now() - startTime < duration) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    
    const statusCounts = await prisma.signal.groupBy({
      by: ["status"],
      _count: true,
      where: { id: { in: signals.map((s) => s.id) } },
    });

    const statusMap = new Map(statusCounts.map((s) => [s.status, s._count]));
    const pending = statusMap.get("PENDING") || 0;
    const analyzing = statusMap.get("ANALYZING") || 0;
    const analyzed = statusMap.get("ANALYZED") || 0;
    const failed = statusMap.get("FAILED") || 0;
    const lowQuality = statusMap.get("LOW_QUALITY") || 0;
    const nonEnglish = statusMap.get("NON_ENGLISH") || 0;

    console.log(`[${elapsed}s] PENDING: ${pending}, ANALYZING: ${analyzing}, ANALYZED: ${analyzed}, FAILED: ${failed}, LOW_QUALITY: ${lowQuality}, NON_ENGLISH: ${nonEnglish}`);

    // If all signals are no longer PENDING or ANALYZING, we're done
    if (pending === 0 && analyzing === 0) {
      console.log("\n✓ All signals processed!");
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  // Final status
  console.log("\n=== Final Status ===");
  const finalSignals = await prisma.signal.findMany({
    where: { id: { in: signals.map((s) => s.id) } },
    select: {
      id: true,
      title: true,
      status: true,
      analyses: {
        select: {
          id: true,
          agentPersona: true,
          confidence: true,
        },
      },
    },
  });

  finalSignals.forEach((s) => {
    console.log(`\n${s.id}: ${s.status}`);
    console.log(`  Title: ${s.title.substring(0, 60)}...`);
    console.log(`  Analyses: ${s.analyses.length}`);
    s.analyses.forEach((a) => {
      console.log(`    - ${a.agentPersona}: ${a.confidence.toFixed(2)} confidence`);
    });
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
