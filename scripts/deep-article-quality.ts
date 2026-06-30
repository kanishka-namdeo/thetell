import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });
  const { prisma } = await import("../src/lib/db");

  console.log("=== DEEP CONTENT QUALITY ANALYSIS ===\n");

  // Get a diverse sample of articles
  const articles = await prisma.article.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    include: { company: { select: { name: true } } },
  });

  let qualityIssues = 0;
  let totalArticles = articles.length;

  for (const article of articles) {
    if (article.body.length === 0) {
      console.log(`❌ CRITICAL: Empty article - "${article.title}" (${article.company.name})`);
      qualityIssues++;
      continue;
    }

    console.log(`\n--- ${article.title} ---`);
    console.log(`Company: ${article.company.name} | Persona: ${article.agentPersona}`);
    console.log(`Length: ${article.body.length} chars, ${article.body.split(/\s+/).length} words`);
    
    const issues: string[] = [];
    
    // 1. Check for repetitive content
    const sentences = article.body.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const sentenceCounts = new Map<string, number>();
    for (const s of sentences) {
      const normalized = s.trim().toLowerCase();
      sentenceCounts.set(normalized, (sentenceCounts.get(normalized) || 0) + 1);
    }
    const repeatedSentences = Array.from(sentenceCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([text, count]) => ({ text: text.substring(0, 80), count }));
    
    if (repeatedSentences.length > 0) {
      issues.push(`Repetitive sentences: ${repeatedSentences.length}`);
      console.log(`  ⚠️  Repeated sentences:`);
      for (const r of repeatedSentences.slice(0, 2)) {
        console.log(`     "${r.text}..." (×${r.count})`);
      }
    }

    // 2. Check for generic filler phrases
    const fillerPhrases = [
      "in today's fast-paced",
      "in an increasingly",
      "it's worth noting",
      "needless to say",
      "at the end of the day",
      "moving forward",
      "in conclusion",
      "as we look ahead",
    ];
    
    const foundFillers = fillerPhrases.filter(p => 
      article.body.toLowerCase().includes(p)
    );
    
    if (foundFillers.length > 0) {
      issues.push(`Generic filler phrases: ${foundFillers.length}`);
      console.log(`  ⚠️  Filler phrases: ${foundFillers.join(", ")}`);
    }

    // 3. Check for vague claims without evidence
    const vaguePatterns = [
      /many experts (say|believe|agree)/i,
      /studies show that/i,
      /research indicates/i,
      /data suggests/i,
      /analysts predict/i,
    ];
    
    const vagueClaims = vaguePatterns.filter(p => p.test(article.body));
    if (vagueClaims.length > 0) {
      issues.push(`Vague claims without citations: ${vagueClaims.length}`);
      console.log(`  ⚠️  Vague claims: ${vagueClaims.length} patterns found`);
    }

    // 4. Check for excessive superlatives
    const superlatives = [
      "revolutionary",
      "groundbreaking",
      "unprecedented",
      "game-changing",
      "disruptive",
      "transformative",
    ];
    
    const superlativeCount = superlatives.filter(s => 
      article.body.toLowerCase().includes(s)
    ).length;
    
    if (superlativeCount > 3) {
      issues.push(`Excessive superlatives: ${superlativeCount}`);
      console.log(`  ⚠️  Superlative overload: ${superlativeCount} instances`);
    }

    // 5. Check for unsupported predictions
    const predictionPatterns = [
      /will (surely|certainly|definitely)/i,
      /is guaranteed to/i,
      /will inevitably/i,
      /bound to/i,
    ];
    
    const unsupportedPredictions = predictionPatterns.filter(p => 
      p.test(article.body)
    );
    
    if (unsupportedPredictions.length > 0) {
      issues.push(`Unsupported predictions: ${unsupportedPredictions.length}`);
      console.log(`  ⚠️  Overconfident predictions: ${unsupportedPredictions.length}`);
    }

    // 6. Check paragraph structure
    const paragraphs = article.body.split(/\n\n+/).filter(p => p.trim().length > 0);
    const avgParagraphLength = paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length;
    
    if (avgParagraphLength < 100) {
      issues.push(`Very short paragraphs (avg ${Math.round(avgParagraphLength)} chars)`);
      console.log(`  ⚠️  Short paragraphs: avg ${Math.round(avgParagraphLength)} chars`);
    } else if (avgParagraphLength > 500) {
      issues.push(`Very long paragraphs (avg ${Math.round(avgParagraphLength)} chars)`);
      console.log(`  ⚠️  Long paragraphs: avg ${Math.round(avgParagraphLength)} chars`);
    }

    // 7. Check for proper section structure
    const headers = (article.body.match(/^## .+$/gm) || []);
    if (headers.length === 0) {
      issues.push(`No section headers`);
      console.log(`  ⚠️  No markdown headers`);
    } else if (headers.length < 2) {
      issues.push(`Too few sections (${headers.length})`);
      console.log(`  ⚠️  Only ${headers.length} section(s)`);
    }

    // 8. Check for proper sourcing language
    const hasSourcing = article.body.includes("according to") ||
                       article.body.includes("reported by") ||
                       article.body.includes("stated that") ||
                       article.body.includes("announced");
    
    if (!hasSourcing && article.agentPersona === "ANALYST") {
      issues.push(`No sourcing language for Analyst persona`);
      console.log(`  ⚠️  Analyst article lacks sourcing language`);
    }

    // 9. Check summary quality
    if (article.summary.length < 100) {
      issues.push(`Summary too short (${article.summary.length} chars)`);
      console.log(`  ⚠️  Short summary: ${article.summary.length} chars`);
    }

    // 10. Check for copy-paste patterns (repeated phrases across paragraphs)
    const phraseFrequency = new Map<string, number>();
    const words = article.body.toLowerCase().split(/\s+/);
    for (let i = 0; i < words.length - 2; i++) {
      const phrase = `${words[i]} ${words[i+1]} ${words[i+2]}`;
      if (phrase.length > 20) {
        phraseFrequency.set(phrase, (phraseFrequency.get(phrase) || 0) + 1);
      }
    }
    
    const repeatedPhrases = Array.from(phraseFrequency.entries())
      .filter(([_, count]) => count > 2)
      .length;
    
    if (repeatedPhrases > 0) {
      issues.push(`Repeated phrases: ${repeatedPhrases}`);
      console.log(`  ⚠️  Repeated 3-word phrases: ${repeatedPhrases}`);
    }

    if (issues.length === 0) {
      console.log(`  ✓ No quality issues detected`);
    } else {
      console.log(`  📊 Total issues: ${issues.length}`);
      qualityIssues += issues.length;
    }
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`SUMMARY: ${qualityIssues} issues across ${totalArticles} articles`);
  console.log(`Average issues per article: ${(qualityIssues / totalArticles).toFixed(2)}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
