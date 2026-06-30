import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("ERROR: DATABASE_URL not found in .env.local");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log("=== CLEARING SIGNAL DATA ===\n");

  // Count before delete
  const before = {
    signals: await prisma.signal.count(),
    analyses: await prisma.analysis.count(),
    articles: await prisma.article.count(),
    signalThemes: await prisma.signalTheme.count(),
    inferences: await prisma.inference.count(),
    agentDebates: await prisma.agentDebate.count(),
    crossSignalDebates: await prisma.crossSignalDebate.count(),
    inferenceCalibrations: await prisma.inferenceCalibration.count(),
    companyHypotheses: await prisma.companyHypothesis.count(),
    companies: await prisma.company.count(),
  };

  console.log("BEFORE DELETE:");
  for (const [key, val] of Object.entries(before)) {
    console.log(`  ${key}: ${val}`);
  }

  // Delete in dependency order
  console.log("\nDeleting in dependency order...");

  const r1 = await prisma.inferenceCalibration.deleteMany();
  console.log(`  Deleted ${r1.count} InferenceCalibration records`);

  const r2 = await prisma.crossSignalDebate.deleteMany();
  console.log(`  Deleted ${r2.count} CrossSignalDebate records`);

  const r3 = await prisma.agentDebate.deleteMany();
  console.log(`  Deleted ${r3.count} AgentDebate records`);

  const r4 = await prisma.signalTheme.deleteMany();
  console.log(`  Deleted ${r4.count} SignalTheme records`);

  const r5 = await prisma.inference.deleteMany();
  console.log(`  Deleted ${r5.count} Inference records`);

  const r6 = await prisma.companyHypothesis.deleteMany();
  console.log(`  Deleted ${r6.count} CompanyHypothesis records`);

  const r7 = await prisma.article.deleteMany();
  console.log(`  Deleted ${r7.count} Article records`);

  const r8 = await prisma.analysis.deleteMany();
  console.log(`  Deleted ${r8.count} Analysis records`);

  const r9 = await prisma.signal.deleteMany();
  console.log(`  Deleted ${r9.count} Signal records`);

  // Verify after
  const after = {
    signals: await prisma.signal.count(),
    analyses: await prisma.analysis.count(),
    articles: await prisma.article.count(),
    companies: await prisma.company.count(),
  };

  console.log("\nAFTER DELETE:");
  for (const [key, val] of Object.entries(after)) {
    console.log(`  ${key}: ${val}`);
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Companies preserved: ${after.companies}`);
  console.log(`Signals deleted: ${r9.count}`);
  console.log(`Analyses deleted: ${r8.count}`);
  console.log(`Articles deleted: ${r7.count}`);
  const total = r1.count + r2.count + r3.count + r4.count + r5.count + r6.count + r7.count + r8.count + r9.count;
  console.log(`Total records cleaned: ${total}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
