import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TARGET_ID = "cmqxooy74003peklnwdkb5so4";

async function main() {
  // Check if our signal appears in the feed query results
  const feedSignals = await prisma.signal.findMany({
    take: 20,
    orderBy: { scrapedAt: "desc" },
    where: { status: "ANALYZED" },
    select: { id: true, title: true, scrapedAt: true },
  });

  const found = feedSignals.find((s) => s.id === TARGET_ID);
  console.log(`Feed has ${feedSignals.length} signals (top 20 by scrapedAt desc)`);
  console.log(`Target signal in feed: ${found ? "YES" : "NO"}`);

  if (!found) {
    // Check why - get our signal's scrapedAt
    const target = await prisma.signal.findUnique({
      where: { id: TARGET_ID },
      select: { id: true, status: true, scrapedAt: true },
    });
    console.log(`\nTarget signal scrapedAt: ${target?.scrapedAt}`);
    console.log(`Oldest in feed top 20: ${feedSignals[feedSignals.length - 1]?.scrapedAt}`);
    console.log("\nSignal is ANALYZED but older than top 20 most recent signals.");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
