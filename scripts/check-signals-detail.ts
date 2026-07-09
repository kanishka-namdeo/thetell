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
  const ids = [
    "cmqxonxc4003deklndr3aww08",
    "cmqxonxkc003feklnhur7iwx4",
    "cmqxonxly003jeklnva53jsma",
  ];

  console.log("=== Signal Analysis Details ===\n");

  for (const id of ids) {
    const signal = await prisma.signal.findUnique({
      where: { id },
      select: { id: true, title: true, status: true, companyId: true },
    });

    if (!signal) {
      console.log(`Signal ${id} not found`);
      continue;
    }

    const analyses = await prisma.analysis.findMany({
      where: { signalId: id },
      select: { id: true, agentPersona: true, confidence: true, summary: true },
    });

    const articles = await prisma.article.findMany({
      where: { companyId: signal.companyId },
      select: { id: true, title: true, status: true, agentPersona: true },
      take: 3,
    });

    console.log(`Signal: ${signal.id.substring(0, 12)}...`);
    console.log(`  Title: ${signal.title.substring(0, 60)}...`);
    console.log(`  Status: ${signal.status}`);
    console.log(`  Analyses: ${analyses.length}`);
    analyses.forEach((a) => {
      console.log(`    - ${a.agentPersona}: confidence=${a.confidence}, summary="${a.summary?.substring(0, 50)}..."`);
    });
    console.log(`  Articles (company): ${articles.length}`);
    articles.forEach((a) => {
      console.log(`    - ${a.agentPersona}: "${a.title.substring(0, 50)}..." (${a.status})`);
    });
    console.log();
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
