import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

// Setup database connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkSignalStatus(signalIds: string[]) {
  const signals = await prisma.signal.findMany({
    where: { id: { in: signalIds } },
    select: { id: true, title: true, status: true, updatedAt: true },
  });
  
  const statusCounts = signals.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return { signals, statusCounts };
}

async function main() {
  console.log("=== Analysis Pipeline Test ===\n");

  // Step 1: Get PENDING signals before test
  console.log("1. Checking initial signal state...");
  const beforeSignals = await prisma.signal.findMany({
    where: { status: "PENDING" },
    select: { id: true, title: true, status: true },
    take: 10,
  });
  
  console.log(`Found ${beforeSignals.length} PENDING signals to track`);
  const testSignalIds = beforeSignals.map((s) => s.id);
  
  if (testSignalIds.length === 0) {
    console.log("No PENDING signals found. Checking for other statuses...");
    const allSignals = await prisma.signal.groupBy({
      by: ["status"],
      _count: true,
    });
    console.log("Current signal distribution:", JSON.stringify(allSignals, null, 2));
    await prisma.$disconnect();
    return;
  }

  // Step 2: Trigger analysis via API (requires admin auth)
  console.log("\n2. Triggering analysis pipeline...");
  console.log("Note: This requires admin authentication.");
  console.log("You can trigger it manually via:");
  console.log("  curl -X POST http://localhost:3000/api/v1/admin/analysis/run?scope=new");
  console.log("  (with valid admin session cookie)");
  console.log("\nOr via the admin dashboard at:");
  console.log("  http://localhost:3000/dashboard/admin/control-center");
  console.log("\nAlternatively, you can trigger Inngest directly:");
  console.log("  pnpm dlx inngest-cli@latest dev -u http://localhost:3000/api/inngest");
  console.log("  Then visit: http://localhost:8288");

  // Step 3: Monitor status transitions
  console.log("\n3. Monitoring signal status transitions...");
  console.log("Tracking signals:", testSignalIds.slice(0, 3).map((id) => id.substring(0, 8)).join(", "), "...");
  
  let lastStatus = "";
  const maxAttempts = 60; // 5 minutes max
  let attempt = 0;
  
  while (attempt < maxAttempts) {
    attempt++;
    const { signals, statusCounts } = await checkSignalStatus(testSignalIds);
    
    const currentStatus = JSON.stringify(statusCounts);
    if (currentStatus !== lastStatus) {
      console.log(`\n[${new Date().toISOString().substring(11, 19)}] Status changed:`);
      console.log(`  ${currentStatus}`);
      lastStatus = currentStatus;
      
      // Show sample signals
      const sample = signals.slice(0, 3);
      sample.forEach((s) => {
        console.log(`  - ${s.id.substring(0, 8)}... ${s.status} (${s.title.substring(0, 50)}...)`);
      });
    }
    
    // Check if all signals are ANALYZED
    if (statusCounts["ANALYZED"] === testSignalIds.length) {
      console.log("\n✓ All signals successfully analyzed!");
      break;
    }
    
    // Check for failures
    if (statusCounts["FAILED"] && statusCounts["FAILED"] > 0) {
      console.log(`\n⚠ ${statusCounts["FAILED"]} signal(s) failed analysis`);
    }
    
    await sleep(5000); // Check every 5 seconds
  }
  
  if (attempt >= maxAttempts) {
    console.log("\n⚠ Timeout: Analysis did not complete within 5 minutes");
  }

  // Step 4: Final state
  console.log("\n4. Final signal state:");
  const { statusCounts: finalCounts } = await checkSignalStatus(testSignalIds);
  console.log(JSON.stringify(finalCounts, null, 2));

  // Step 5: Check for generated articles
  console.log("\n5. Checking for generated articles...");
  const articleCount = await prisma.article.count({
    where: {
      companyId: { in: testSignalIds.map(() => "") }, // This won't work, need company IDs
    },
  });
  
  const totalArticles = await prisma.article.count();
  console.log(`Total articles in database: ${totalArticles}`);
  
  const recentArticles = await prisma.article.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      company: { select: { name: true } },
    },
  });
  
  console.log("\nRecent articles:");
  recentArticles.forEach((a) => {
    console.log(`  - ${a.title.substring(0, 60)}... (${a.status})`);
    console.log(`    Company: ${a.company.name}, Created: ${a.createdAt.toISOString().substring(0, 19)}`);
  });

  await prisma.$disconnect();
  console.log("\n=== Test Complete ===");
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
