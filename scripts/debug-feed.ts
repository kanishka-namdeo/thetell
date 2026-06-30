import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { prisma } = await import("../src/lib/db");

  console.log("=== Debugging Feed Data ===\n");

  // 1. Check total signals
  const totalSignals = await prisma.signal.count();
  console.log("Total signals:", totalSignals);

  // 2. Check signals by status
  const signalsByStatus = await prisma.signal.groupBy({
    by: ["status"],
    _count: { status: true },
  });
  console.log("\nSignals by status:");
  for (const row of signalsByStatus) {
    console.log(`  ${row.status}: ${row._count.status}`);
  }

  // 3. Check ANALYZED signals specifically
  const analyzedCount = await prisma.signal.count({ where: { status: "ANALYZED" } });
  console.log("\nANALYZED count (using count):", analyzedCount);

  // 4. Try to fetch ANALYZED signals
  const analyzedSignals = await prisma.signal.findMany({
    where: { status: "ANALYZED" },
    take: 10,
    select: {
      id: true,
      title: true,
      status: true,
      companyId: true,
    },
  });
  console.log("\nANALYZED signals fetched:", analyzedSignals.length);
  for (const s of analyzedSignals) {
    console.log(`  - ${s.id}: ${s.title?.slice(0, 40)}...`);
  }

  // 5. Check if signals have analyses
  const signalsWithAnalyses = await prisma.signal.findMany({
    where: { status: "ANALYZED" },
    take: 5,
    include: { analyses: true },
  });
  console.log("\nANALYZED signals with analyses:", signalsWithAnalyses.length);
  for (const s of signalsWithAnalyses) {
    console.log(`  - ${s.id}: ${s.analyses.length} analyses`);
  }

  // 6. Check the exact query used by the feed
  const PAGE_SIZE = 20;
  const feedSignals = await prisma.signal.findMany({
    take: PAGE_SIZE + 1,
    orderBy: { scrapedAt: "desc" },
    where: { status: "ANALYZED" },
    include: {
      company: true,
      analyses: true,
    },
  });
  console.log("\nFeed query returned:", feedSignals.length, "signals");

  await prisma.$disconnect();
}

main().catch(console.error);
