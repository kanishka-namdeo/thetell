process.env.DATABASE_URL = "postgresql://thell_user:thell_password@localhost:5433/the_tell";

import { prisma } from "../src/lib/db";

async function main() {
  const signalId = "cmqw39ut2004ea8lnuhoixjw3";
  
  console.log("=== Checking analysis results for", signalId, "===\n");

  const signal = await prisma.signal.findUnique({
    where: { id: signalId },
    include: { 
      analyses: true,
      company: true,
    },
  });

  if (!signal) {
    console.error("Signal not found");
    process.exit(1);
  }

  console.log("Signal status:", signal.status);
  console.log("Analyses count:", signal.analyses.length);
  console.log("Articles count:", signal.articles.length);
  
  if (signal.analyses.length > 0) {
    console.log("\n=== Analyses ===");
    for (const analysis of signal.analyses) {
      console.log(`\nAnalysis ID: ${analysis.id}`);
      console.log(`  Persona: ${analysis.persona}`);
      console.log(`  Confidence: ${analysis.confidence}`);
      console.log(`  Sentiment: ${analysis.sentiment}`);
      console.log(`  Summary: ${analysis.summary?.substring(0, 200)}...`);
      console.log(`  Facts count: ${analysis.facts?.length || 0}`);
      console.log(`  Themes count: ${analysis.themes?.length || 0}`);
    }
  }
  
  if (signal.articles.length > 0) {
    console.log("\n=== Articles ===");
    for (const article of signal.articles) {
      console.log(`\nArticle ID: ${article.id}`);
      console.log(`  Title: ${article.title}`);
      console.log(`  Persona: ${article.persona}`);
      console.log(`  Status: ${article.status}`);
      console.log(`  Content length: ${article.content?.length || 0}`);
      console.log(`  Content preview: ${article.content?.substring(0, 200)}...`);
    }
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
