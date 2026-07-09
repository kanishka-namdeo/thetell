import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });

async function main() {
  console.log("Resetting stuck ANALYZING signals to PENDING...\n");

  const result = await p.signal.updateMany({
    where: { status: "ANALYZING" },
    data: { status: "PENDING" },
  });

  console.log(`Reset ${result.count} signals from ANALYZING to PENDING`);

  // Verify the change
  const counts = await p.signal.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  console.log("\nUpdated signal counts by status:");
  console.log(JSON.stringify(counts, null, 2));

  await p.$disconnect();
}

main().catch(console.error);
