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
  console.log("=== Checking feed query ===\n");

  // Simulate the feed query
  const feedSignals = await prisma.signal.findMany({
    take: 20,
    orderBy: { scrapedAt: "desc" },
    where: { status: "ANALYZED" },
    select: {
      id: true,
      title: true,
      sourceType: true,
      scrapedAt: true,
      company: {
        select: {
          id: true,
          name: true,
        },
      },
      analyses: {
        select: {
          confidence: true,
          sentiment: true,
          agentPersona: true,
        },
      },
    },
  });

  console.log(`Feed query returned ${feedSignals.length} signals\n`);
  
  if (feedSignals.length > 0) {
    console.log("Sample signal:");
    console.log(JSON.stringify(feedSignals[0], null, 2));
  } else {
    console.log("No ANALYZED signals found!");
    
    // Check all statuses
    const statusCounts = await prisma.signal.groupBy({
      by: ["status"],
      _count: true,
    });
    console.log("\nSignal status counts:");
    console.log(JSON.stringify(statusCounts, null, 2));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
