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
  console.log("=== Checking Stuck ANALYZING Signals ===\n");

  const analyzingSignals = await prisma.signal.findMany({
    where: { status: "ANALYZING" },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  console.log(`Found ${analyzingSignals.length} signals in ANALYZING status:\n`);
  
  analyzingSignals.forEach((s) => {
    const age = Date.now() - new Date(s.updatedAt).getTime();
    const ageMin = Math.floor(age / 60000);
    console.log(`ID: ${s.id}`);
    console.log(`Title: ${s.title}`);
    console.log(`Created: ${s.createdAt.toISOString()}`);
    console.log(`Last Updated: ${s.updatedAt.toISOString()}`);
    console.log(`Age: ${ageMin} minutes`);
    console.log('---');
  });

  // Check if these signals have any analysis records
  console.log("\n=== Checking Analysis Records ===\n");
  
  for (const signal of analyzingSignals) {
    const analyses = await prisma.analysis.findMany({
      where: { signalId: signal.id },
      select: {
        id: true,
        agentPersona: true,
        analyzedAt: true,
      },
    });

    console.log(`Signal ${signal.id}:`);
    if (analyses.length === 0) {
      console.log(`  ✗ No analysis records found`);
    } else {
      console.log(`  ✓ Found ${analyses.length} analysis records:`);
      analyses.forEach((a) => {
        console.log(`    - ${a.agentPersona} created at ${a.createdAt.toISOString()}`);
      });
    }
    console.log('---');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
