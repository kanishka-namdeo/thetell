import "dotenv/config";
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
const prisma = new PrismaClient({ adapter });

const TARGET_ID = "cmqxooy74003peklnwdkb5so4";

async function main() {
  console.log("=== Resetting stuck signal ===\n");

  const signal = await prisma.signal.findUnique({
    where: { id: TARGET_ID },
    select: { id: true, status: true, title: true, updatedAt: true },
  });

  if (!signal) {
    console.log(`Signal ${TARGET_ID} not found`);
    await prisma.$disconnect();
    return;
  }

  console.log("Before:");
  console.log(`  id: ${signal.id}`);
  console.log(`  title: ${signal.title}`);
  console.log(`  status: ${signal.status}`);
  console.log(`  updatedAt: ${signal.updatedAt}`);

  const result = await prisma.signal.update({
    where: { id: TARGET_ID },
    data: { status: "PENDING" },
    select: { id: true, status: true, updatedAt: true },
  });

  console.log("\nAfter:");
  console.log(`  id: ${result.id}`);
  console.log(`  status: ${result.status}`);
  console.log(`  updatedAt: ${result.updatedAt}`);

  console.log("\nReset complete. Signal is now PENDING.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
