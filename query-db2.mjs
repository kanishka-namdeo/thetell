import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Count records
  const signalCount = await prisma.signal.count();
  const analysisCount = await prisma.analysis.count();
  const articleCount = await prisma.article.count();
  const companyCount = await prisma.company.count();
  console.log("=== RECORD COUNTS ===");
  console.log("Signals:", signalCount);
  console.log("Analyses:", analysisCount);
  console.log("Articles:", articleCount);
  console.log("Companies:", companyCount);

  // Articles - show key fields only
  console.log("\n=== ARTICLES (limit 5) ===");
  const articles = await prisma.article.findMany({ take: 5, select: { id: true, title: true, slug: true, status: true, agentPersona: true, companyId: true, publishedAt: true, createdAt: true } });
  console.log(JSON.stringify(articles, null, 2));

  // Analyses summary
  console.log("\n=== ANALYSIS SUMMARY ===");
  const byPersona = await prisma.analysis.groupBy({ by: ["agentPersona"], _count: true });
  console.log("By persona:", JSON.stringify(byPersona));
  const bySentiment = await prisma.analysis.groupBy({ by: ["sentiment"], _count: true });
  console.log("By sentiment:", JSON.stringify(bySentiment));

  // Signals summary
  console.log("\n=== SIGNAL STATUS SUMMARY ===");
  const byStatus = await prisma.signal.groupBy({ by: ["status"], _count: true });
  console.log("By status:", JSON.stringify(byStatus));
  const byType = await prisma.signal.groupBy({ by: ["sourceType"], _count: true });
  console.log("By source type:", JSON.stringify(byType));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
