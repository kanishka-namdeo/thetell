import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set");
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log("Checking signal status counts...");
  
  const statusCounts = await prisma.signal.groupBy({
    by: ["status"],
    _count: true,
  });
  
  console.log("\nSignal status counts:");
  statusCounts.forEach((s) => {
    console.log(`  ${s.status}: ${s._count}`);
  });

  const pending = await prisma.signal.count({ where: { status: "PENDING" } });
  const analyzing = await prisma.signal.count({ where: { status: "ANALYZING" } });
  const analyzed = await prisma.signal.count({ where: { status: "ANALYZED" } });
  
  console.log(`\nSummary: PENDING=${pending}, ANALYZING=${analyzing}, ANALYZED=${analyzed}`);
  
  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
