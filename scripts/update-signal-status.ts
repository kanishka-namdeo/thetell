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
  const updated = await prisma.signal.updateMany({
    where: {
      sourceType: "SOCIAL",
      status: "PENDING",
      OR: [
        { title: { contains: "NVDA" } },
        { title: { contains: "AAPL" } },
        { title: { contains: "TSLA" } },
      ],
    },
    data: { status: "ANALYZED" },
  });

  console.log(`Updated ${updated.count} signals to ANALYZED status`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
