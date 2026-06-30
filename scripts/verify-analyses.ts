import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== VERIFY ANALYSES ===\n");

  const analyzedSignals = await prisma.signal.findMany({
    where: { status: "ANALYZED" },
    include: {
      analyses: true,
      company: true,
    },
    take: 5,
  });

  console.log(`Found ${analyzedSignals.length} ANALYZED signals\n`);

  for (const signal of analyzedSignals) {
    console.log(`Signal: ${signal.title.slice(0, 60)}`);
    console.log(`  Company: ${signal.company?.name || "Unknown"}`);
    console.log(`  Analyses: ${signal.analyses.length}`);
    
    for (const analysis of signal.analyses) {
      console.log(`    - ${analysis.agentPersona}: confidence=${analysis.confidence.toFixed(3)}, sentiment=${analysis.sentiment}`);
      console.log(`      Summary: ${analysis.summary.slice(0, 80)}...`);
      console.log(`      Facts: ${(analysis.keyFacts as any[]).length}`);
      console.log(`      Themes: ${(analysis.strategicThemes as any[]).length}`);
    }
    console.log();
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);
