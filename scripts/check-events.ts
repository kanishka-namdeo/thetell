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
  console.log("=== Checking Analysis Events ===\n");

  // Check if there are any recent job runs
  const recentJobs = await prisma.job.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      error: true,
    },
  });

  console.log("Recent jobs:");
  recentJobs.forEach((j) => {
    console.log(`  - ${j.name}: ${j.status} at ${j.createdAt.toISOString()}`);
    if (j.error) {
      console.log(`    Error: ${j.error}`);
    }
  });

  // Check pipeline runs
  const recentRuns = await prisma.pipelineRun.findMany({
    take: 5,
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      signalsProcessed: true,
      signalsFailed: true,
    },
  });

  console.log("\nRecent pipeline runs:");
  recentRuns.forEach((r) => {
    console.log(`  - ${r.status}: started ${r.startedAt.toISOString()}, processed ${r.signalsProcessed}, failed ${r.signalsFailed}`);
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
