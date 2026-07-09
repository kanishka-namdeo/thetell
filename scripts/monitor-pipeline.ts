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
  console.log("=== Pipeline Progress Monitor ===\n");
  console.log("Monitoring signal status changes over 30 seconds...\n");

  const startTime = Date.now();
  const duration = 30000; // 30 seconds
  const interval = 5000; // Check every 5 seconds

  let lastPending = -1;
  let lastAnalyzing = -1;
  let lastAnalyzed = -1;
  let initialAnalyzed = -1;

  while (Date.now() - startTime < duration) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    
    const pending = await prisma.signal.count({ where: { status: "PENDING" } });
    const analyzing = await prisma.signal.count({ where: { status: "ANALYZING" } });
    const analyzed = await prisma.signal.count({ where: { status: "ANALYZED" } });

    const pendingChange = lastPending === -1 ? 0 : pending - lastPending;
    const analyzingChange = lastAnalyzing === -1 ? 0 : analyzing - lastAnalyzing;
    const analyzedChange = lastAnalyzed === -1 ? 0 : analyzed - lastAnalyzed;

    console.log(`[${elapsed}s] PENDING: ${pending} (${pendingChange >= 0 ? '+' : ''}${pendingChange}), ANALYZING: ${analyzing} (${analyzingChange >= 0 ? '+' : ''}${analyzingChange}), ANALYZED: ${analyzed} (${analyzedChange >= 0 ? '+' : ''}${analyzedChange})`);

    lastPending = pending;
    lastAnalyzing = analyzing;
    lastAnalyzed = analyzed;
    if (initialAnalyzed === -1) initialAnalyzed = analyzed;

    if (Date.now() - startTime < duration) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  console.log("\n=== Final Status ===");
  const finalPending = await prisma.signal.count({ where: { status: "PENDING" } });
  const finalAnalyzing = await prisma.signal.count({ where: { status: "ANALYZING" } });
  const finalAnalyzed = await prisma.signal.count({ where: { status: "ANALYZED" } });

  console.log(`PENDING: ${finalPending}`);
  console.log(`ANALYZING: ${finalAnalyzing}`);
  console.log(`ANALYZED: ${finalAnalyzed}`);

  const progress = finalAnalyzed - initialAnalyzed;
  if (progress > 0) {
    console.log(`\n✓ Progress! ${progress} new signals analyzed during monitoring.`);
  } else {
    console.log(`\n✗ No progress. Still ${finalAnalyzed} analyzed signals.`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
