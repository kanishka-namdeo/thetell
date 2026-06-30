import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const signals = await prisma.signal.findMany({
    orderBy: { scrapedAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      status: true,
      sourceType: true,
      rawContent: true,
      _count: { select: { analyses: true } },
    },
  });

  console.log("=== SIGNALS ===");
  for (const s of signals) {
    console.log(
      `[${s.status}] ${s.sourceType.padEnd(15)} analyses:${s._count.analyses} content:${String(s.rawContent.length).padEnd(5)} | ${s.title.slice(0, 60)}`
    );
  }

  // Also check for signals with FAILED status
  const failed = await prisma.signal.count({ where: { status: "FAILED" } });
  const analyzed = await prisma.signal.count({ where: { status: "ANALYZED" } });
  const lowQuality = await prisma.signal.count({ where: { status: "LOW_QUALITY" } });
  const nonEnglish = await prisma.signal.count({ where: { status: "NON_ENGLISH" } });
  const pending = await prisma.signal.count({ where: { status: "PENDING" } });
  const analyzing = await prisma.signal.count({ where: { status: "ANALYZING" } });

  console.log("\n=== STATUS COUNTS ===");
  console.log(`  PENDING:     ${pending}`);
  console.log(`  ANALYZING:   ${analyzing}`);
  console.log(`  ANALYZED:    ${analyzed}`);
  console.log(`  FAILED:      ${failed}`);
  console.log(`  LOW_QUALITY: ${lowQuality}`);
  console.log(`  NON_ENGLISH: ${nonEnglish}`);

  // Check analyses
  const analyses = await prisma.analysis.groupBy({
    by: ["agentPersona"],
    _count: true,
  });
  console.log("\n=== ANALYSES ===");
  for (const a of analyses) {
    console.log(`  ${a.agentPersona}: ${a._count}`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);
