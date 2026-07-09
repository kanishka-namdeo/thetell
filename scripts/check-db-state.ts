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
const p = new PrismaClient({ adapter });

async function main() {
  const counts = await p.signal.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  console.log("Signal counts by status:", JSON.stringify(counts, null, 2));

  const total = await p.signal.count();
  console.log("Total signals:", total);

  const companies = await p.company.count();
  console.log("Total companies:", companies);

  const analyses = await p.analysis.count();
  console.log("Total analyses:", analyses);

  const articles = await p.article.count();
  console.log("Total articles:", articles);

  // Check recent signals
  const recentSignals = await p.signal.findMany({
    take: 5,
    orderBy: { scrapedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      sourceType: true,
      scrapedAt: true,
      companyId: true,
    },
  });
  console.log("\nRecent signals:", JSON.stringify(recentSignals, null, 2));

  // Check if there are any PENDING signals
  const pending = await p.signal.count({ where: { status: "PENDING" } });
  console.log("\nPENDING signals:", pending);

  // Check company data sources
  const sources = await p.companyDataSource.count();
  const activeSources = await p.companyDataSource.count({
    where: { isActive: true },
  });
  console.log("\nCompany data sources:", sources, "active:", activeSources);

  await pool.end();
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
