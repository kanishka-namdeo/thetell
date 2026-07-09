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
  console.log("=== Checking Recent Analysis Records ===\n");

  // Check the 3 signals that were just processed
  const signalIds = [
    "cmqxonxc4003deklndr3aww08",
    "cmqxonxkc003feklnhur7iwx4",
    "cmqxonxly003jeklnva53jsma",
  ];

  for (const signalId of signalIds) {
    console.log(`\nSignal: ${signalId}`);
    
    const signal = await prisma.signal.findUnique({
      where: { id: signalId },
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
      },
    });
    
    console.log(`  Status: ${signal?.status}`);
    console.log(`  Updated: ${signal?.updatedAt.toISOString()}`);
    console.log(`  Title: ${signal?.title.substring(0, 60)}...`);

    const analyses = await prisma.analysis.findMany({
      where: { signalId },
      select: {
        id: true,
        agentPersona: true,
        confidence: true,
        analyzedAt: true,
        summary: true,
      },
    });

    console.log(`  Analyses: ${analyses.length}`);
    analyses.forEach((a) => {
      console.log(`    - ${a.agentPersona}: ${a.confidence.toFixed(2)} confidence`);
      console.log(`      Analyzed: ${a.analyzedAt?.toISOString() || "NULL"}`);
      console.log(`      Summary: ${a.summary?.substring(0, 80)}...`);
    });
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
