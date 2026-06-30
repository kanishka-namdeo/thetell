import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== RESET FAILED SIGNALS TO PENDING ===\n");

  const result = await prisma.signal.updateMany({
    where: { status: "FAILED" },
    data: { status: "PENDING" },
  });

  console.log(`Reset ${result.count} signals from FAILED to PENDING`);

  // Verify
  const counts = await prisma.signal.groupBy({
    by: ["status"],
    _count: true,
  });

  console.log("\nSignal status counts:");
  for (const c of counts) {
    console.log(`  ${c.status}: ${c._count}`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);
