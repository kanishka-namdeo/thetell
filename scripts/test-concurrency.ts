import { prisma } from "../src/lib/db";

async function main() {
  // Check current signal status
  const statusCounts = await prisma.signal.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("Signal status counts:");
  statusCounts.forEach((s) => {
    console.log(`  ${s.status}: ${s._count}`);
  });

  // Get 5 PENDING signals
  const pending = await prisma.signal.findMany({
    where: { status: "PENDING" },
    select: { id: true, title: true },
    take: 5,
  });

  console.log(`\nFound ${pending.length} PENDING signals`);
  pending.forEach((s) => {
    console.log(`  ${s.id}: ${s.title?.substring(0, 60)}`);
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
