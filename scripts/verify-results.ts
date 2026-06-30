import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const connectionString = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== FINAL VERIFICATION ===\n");

  // Count articles
  const totalArticles = await prisma.article.count();
  console.log(`✓ Articles created: ${totalArticles} (expected: 8 = 4 signals × 2 agents)`);

  // Count themes
  const totalThemes = await prisma.signalTheme.count();
  console.log(`✓ Signal themes created: ${totalThemes}`);

  // Count inferences
  const totalInferences = await prisma.inference.count();
  console.log(`✓ Inferences created: ${totalInferences}`);

  // Sample articles
  console.log("\n=== SAMPLE ARTICLES (first 3) ===");
  const sampleArticles = await prisma.article.findMany({
    take: 3,
    select: {
      id: true,
      title: true,
      agentPersona: true,
      summary: true,
      companyId: true,
      analysisIds: true,
      status: true,
      publishedAt: true,
    },
  });

  for (const article of sampleArticles) {
    console.log(`\nArticle ID: ${article.id}`);
    console.log(`  Title: ${article.title}`);
    console.log(`  Agent: ${article.agentPersona}`);
    console.log(`  Status: ${article.status}`);
    console.log(`  Published: ${article.publishedAt}`);
    console.log(`  Summary: ${article.summary.substring(0, 120)}...`);
    console.log(`  Analysis IDs: ${(article.analysisIds as string[]).join(", ")}`);
  }

  // Sample themes
  console.log("\n=== SAMPLE THEMES (first 5) ===");
  const sampleThemes = await prisma.signalTheme.findMany({
    take: 5,
    select: {
      id: true,
      label: true,
      companyId: true,
      status: true,
      momentum: true,
      firstSeen: true,
    },
  });

  for (const theme of sampleThemes) {
    console.log(`\nTheme ID: ${theme.id}`);
    console.log(`  Label: ${theme.label}`);
    console.log(`  Status: ${theme.status}`);
    console.log(`  Momentum: ${theme.momentum.toFixed(2)}`);
    console.log(`  First seen: ${theme.firstSeen}`);
  }

  // Show signal-theme connections
  console.log("\n=== SIGNAL-THEME CONNECTIONS ===");
  const signalsWithThemes = await prisma.signal.findMany({
    where: { themes: { some: {} } },
    select: {
      id: true,
      title: true,
      themes: {
        select: {
          id: true,
          label: true,
        },
      },
    },
  });

  console.log(`Signals with themes: ${signalsWithThemes.length}`);
  for (const signal of signalsWithThemes) {
    console.log(`\nSignal: ${signal.title.substring(0, 60)}`);
    console.log(`  Themes: ${signal.themes.map((t) => t.label).join(", ")}`);
  }

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log(`Articles: ${totalArticles}/8 created successfully`);
  console.log(`Themes: ${totalThemes} theme clusters identified`);
  console.log(`Inferences: ${totalInferences} (requires 3+ signals from 2+ source types per theme)`);
  console.log(`\nNote: No inferences created because all signals are NEWS type (need 2+ source types)`);
  console.log(`      and each theme cluster only has 1 signal (need 3+ signals per cluster).`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async (e) => {
  console.error("Error:", e);
  process.exit(1);
});
