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
  console.log("=== Resetting Stuck ANALYZING Signals ===\n");

  // Reset signals stuck in ANALYZING for more than 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  
  const stuckSignals = await prisma.signal.findMany({
    where: {
      status: "ANALYZING",
      updatedAt: { lt: fiveMinutesAgo },
    },
    select: {
      id: true,
      title: true,
      updatedAt: true,
    },
  });

  console.log(`Found ${stuckSignals.length} signals stuck in ANALYZING for >5 minutes`);

  if (stuckSignals.length > 0) {
    const result = await prisma.signal.updateMany({
      where: {
        status: "ANALYZING",
        updatedAt: { lt: fiveMinutesAgo },
      },
      data: { status: "PENDING" },
    });

    console.log(`Reset ${result.count} signals back to PENDING\n`);
  }

  // Check current status
  const statusCounts = await prisma.signal.groupBy({
    by: ["status"],
    _count: true,
  });

  console.log("Current signal status:");
  statusCounts.forEach((s) => {
    console.log(`  ${s.status}: ${s._count}`);
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
