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
  // Signal status distribution
  const signalStatusCounts = await prisma.signal.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("Signal status counts:", JSON.stringify(signalStatusCounts, null, 2));

  // Total signals
  const totalSignals = await prisma.signal.count();
  console.log(`\nTotal signals: ${totalSignals}`);

  // Feed-eligible: ANALYZED signals with articles via company
  const analyzedSignals = await prisma.signal.count({
    where: { status: "ANALYZED" },
  });
  console.log(`ANALYZED signals: ${analyzedSignals}`);

  // Article counts by status
  const articleStatusCounts = await prisma.article.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("\nArticle status counts:", JSON.stringify(articleStatusCounts, null, 2));

  // Total articles
  const totalArticles = await prisma.article.count();
  console.log(`Total articles: ${totalArticles}`);

  // Sample recent signals
  const recentSignals = await prisma.signal.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      sourceType: true,
      createdAt: true,
      company: { select: { name: true } },
    },
  });
  console.log("\nRecent signals:", JSON.stringify(recentSignals, null, 2));

  // Companies count
  const totalCompanies = await prisma.company.count();
  console.log(`\nTotal companies: ${totalCompanies}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
