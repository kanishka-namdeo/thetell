import { config } from "dotenv";
config();

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";

const connectionString = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const signals = await prisma.signal.findMany({
    where: {
      sourceType: "SOCIAL",
      OR: [
        { title: { contains: "NVDA" } },
        { title: { contains: "AAPL" } },
        { title: { contains: "TSLA" } },
      ],
    },
    select: {
      id: true,
      title: true,
      engagement: true,
      author: true,
      metadata: true,
      status: true,
    },
  });

  console.log("\n=== Seeded Reddit Signals ===\n");
  for (const s of signals) {
    console.log(`Title: ${s.title}`);
    console.log(`Status: ${s.status}`);
    console.log(`Author: ${s.author}`);
    console.log(`Engagement:`, JSON.stringify(s.engagement, null, 2));
    console.log(`Metadata:`, JSON.stringify(s.metadata, null, 2));
    console.log("---");
  }
  console.log(`\nTotal: ${signals.length} signals\n`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
