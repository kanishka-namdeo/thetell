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
  const signalId = "cmqxooy74003peklnwdkb5so4";
  
  const signal = await prisma.signal.findUnique({
    where: { id: signalId },
    include: {
      analyses: true,
      company: { select: { name: true } }
    }
  });

  if (!signal) {
    console.log("Signal not found");
    await prisma.$disconnect();
    return;
  }

  console.log("Signal:", signal.id);
  console.log("Title:", signal.title);
  console.log("Status:", signal.status);
  console.log("Company:", signal.company?.name);
  console.log("Analyses count:", signal.analyses.length);
  console.log("Updated at:", signal.updatedAt);

  if (signal.analyses.length > 0) {
    console.log("\nAnalyses:");
    signal.analyses.forEach(a => {
      console.log(`  - ${a.agentPersona}: confidence ${a.confidence}`);
    });
  }

  await prisma.$disconnect();
}

main().catch(console.error);
