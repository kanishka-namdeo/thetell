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
  console.log("=== Pipeline Status Check ===\n");

  // Check signal status counts
  const statusCounts = await prisma.signal.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("Signal status counts:");
  console.log(JSON.stringify(statusCounts, null, 2));

  // Check for stuck ANALYZING signals
  const analyzingSignals = await prisma.signal.findMany({
    where: { status: "ANALYZING" },
    select: {
      id: true,
      title: true,
      updatedAt: true,
    },
    take: 5,
  });

  if (analyzingSignals.length > 0) {
    console.log(`\n⚠️  ${analyzingSignals.length} signals stuck in ANALYZING:`);
    analyzingSignals.forEach((s) => {
      const age = Date.now() - new Date(s.updatedAt).getTime();
      const ageMin = Math.floor(age / 60000);
      console.log(`  - ${s.title.substring(0, 50)}... (${ageMin} min old)`);
    });
  }

  // Check pending signals
  const pendingCount = await prisma.signal.count({
    where: { status: "PENDING" },
  });
  console.log(`\nPENDING signals waiting for analysis: ${pendingCount}`);

  // Check recent analyses
  const recentAnalyses = await prisma.analysis.findMany({
    take: 5,
    orderBy: { analyzedAt: "desc" },
    select: {
      id: true,
      signalId: true,
      analyzedAt: true,
      signal: {
        select: { title: true },
      },
    },
  });

  if (recentAnalyses.length > 0) {
    console.log("\nMost recent analyses:");
    recentAnalyses.forEach((a) => {
      console.log(`  - ${a.signal.title.substring(0, 50)}... at ${a.analyzedAt.toISOString()}`);
    });
  }

  // Summary sentinel line for /loop regex matching
  const failedCount = await prisma.signal.count({ where: { status: "FAILED" } });
  const analyzedCount = await prisma.signal.count({ where: { status: "ANALYZED" } });
  console.log(`\nPIPELINE_HEALTH: pending=${pendingCount} analyzing=${analyzingSignals.length} stuck=${analyzingSignals.length} analyzed=${analyzedCount} failed=${failedCount}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
