import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });
  const { prisma } = await import("../src/lib/db");

  console.log("=== CLUSTER ARTICLE QUALITY AUDIT ===\n");

  const clusterArticles = await prisma.clusterArticle.findMany({
    include: {
      company: { select: { name: true } },
      theme: {
        select: {
          label: true,
          clusteredSignals: {
            select: { signalId: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Total cluster articles: ${clusterArticles.length}\n`);

  for (const article of clusterArticles) {
    const wordCount = article.body.split(/\s+/).length;
    const signalCount = article.theme.clusteredSignals.length;
    
    console.log(`--- ${article.title} ---`);
    console.log(`Company: ${article.company.name}`);
    console.log(`Theme: ${article.theme.label}`);
    console.log(`Persona: ${article.agentPersona}`);
    console.log(`Status: ${article.status}`);
    console.log(`Signals covered: ${signalCount}`);
    console.log(`Word count: ${wordCount}`);
    console.log(`Body length: ${article.body.length} chars`);
    console.log(`Summary length: ${article.summary.length} chars`);
    
    // Check structure
    const hasKeyFindings = article.body.includes("Key Findings") || article.body.includes("Evidence");
    const hasStrategic = article.body.includes("Strategic") || article.body.includes("Implications");
    const hasBottomLine = article.body.includes("Bottom Line");
    const hasTheTell = article.body.includes("The Tell");
    const hasReadingBetween = article.body.includes("Reading Between");
    
    console.log(`Has Key Findings/Evidence: ${hasKeyFindings}`);
    console.log(`Has Strategic/Implications: ${hasStrategic}`);
    console.log(`Has Bottom Line: ${hasBottomLine}`);
    console.log(`Has The Tell: ${hasTheTell}`);
    console.log(`Has Reading Between: ${hasReadingBetween}`);
    
    // Check for hallucination patterns
    const hallucinationPatterns = [
      "sources say",
      "insiders report",
      "according to sources",
      "people familiar",
      "a source close",
      "unnamed source",
      "industry insiders",
    ];
    
    const foundPatterns = hallucinationPatterns.filter((p) =>
      article.body.toLowerCase().includes(p)
    );
    
    if (foundPatterns.length > 0) {
      console.log(`⚠️  Hallucination patterns: ${foundPatterns.join(", ")}`);
    } else {
      console.log(`✓ No hallucination patterns`);
    }
    
    console.log(`\nBody preview (first 500 chars):`);
    console.log(article.body.substring(0, 500));
    console.log(`\nSummary:`);
    console.log(article.summary);
    console.log("\n" + "=".repeat(80) + "\n");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
