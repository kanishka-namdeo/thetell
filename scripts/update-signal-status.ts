import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { prisma } = await import("../src/lib/db");

  console.log("=== Updating signal statuses ===\n");

  // Count pending signals
  const pendingCount = await prisma.signal.count({ where: { status: "PENDING" } });
  console.log("Pending signals:", pendingCount);

  // Update all PENDING signals to ANALYZED
  const result = await prisma.signal.updateMany({
    where: { status: "PENDING" },
    data: { status: "ANALYZED" },
  });
  console.log("Updated to ANALYZED:", result.count);

  // Verify
  const analyzedCount = await prisma.signal.count({ where: { status: "ANALYZED" } });
  console.log("\nTotal ANALYZED signals:", analyzedCount);

  // Show breakdown
  const byStatus = await prisma.signal.groupBy({
    by: ["status"],
    _count: { status: true },
  });
  console.log("\nStatus breakdown:");
  for (const row of byStatus) {
    console.log(`  ${row.status}: ${row._count.status}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
