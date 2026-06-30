import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL!,
    },
  },
});

async function main() {
  const counts = await prisma.signal.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("Signal status counts:");
  for (const c of counts) {
    console.log(`  ${c.status}: ${c._count}`);
  }
  const total = counts.reduce((sum, c) => sum + c._count, 0);
  console.log(`  TOTAL: ${total}`);
  await prisma.$disconnect();
}

main();
