import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Trigger Analysis Pipeline (Direct HTTP) ===\n");

  console.log("Finding PENDING signals...");
  const pendingSignals = await prisma.signal.findMany({
    where: { status: "PENDING" },
    select: { id: true, title: true },
    take: 3,
  });

  console.log(`Found ${pendingSignals.length} PENDING signals`);

  if (pendingSignals.length === 0) {
    console.log("No PENDING signals to analyze");
    await prisma.$disconnect();
    return;
  }

  console.log("\nSignals to analyze:");
  pendingSignals.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.id} - ${s.title.substring(0, 60)}...`);
  });

  const jobId = crypto.randomUUID();
  console.log(`\nJob ID: ${jobId}`);
  console.log("Sending events to Inngest dev server...");

  // Send events directly to Inngest dev server HTTP API
  const inngestUrl = "http://localhost:8288";
  
  for (const signal of pendingSignals) {
    try {
      const response = await fetch(`${inngestUrl}/e/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "signal/analysis.requested",
          data: {
            signalId: signal.id,
            jobId,
            triggeredBy: "test-script",
            triggeredAt: new Date().toISOString(),
          },
        }),
      });

      if (response.ok) {
        console.log(`  ✓ Queued: ${signal.id.substring(0, 12)}...`);
      } else {
        const text = await response.text();
        console.log(`  ✗ Failed: ${signal.id.substring(0, 12)}... (${response.status}: ${text})`);
      }
    } catch (error) {
      console.log(`  ✗ Error: ${signal.id.substring(0, 12)}... - ${error}`);
    }
  }

  console.log(`\n✓ Triggered ${pendingSignals.length} signals for analysis`);
  console.log("\nMonitor progress:");
  console.log("  - Inngest UI: http://localhost:8288");
  console.log("  - DB check:   pnpm tsx scripts/check-db.ts");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
