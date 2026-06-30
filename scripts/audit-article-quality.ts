import { config } from "dotenv";

async function main() {
  // Load environment variables BEFORE importing db
  config({ path: ".env.local" });

  // Dynamic import to ensure env vars are loaded first
  const { prisma } = await import("../src/lib/db");
  // 1. Overall stats
  const total = await prisma.article.count();
  const published = await prisma.article.count({ where: { status: "PUBLISHED" } });
  const draft = await prisma.article.count({ where: { status: "DRAFT" } });
  const pending = await prisma.article.count({ where: { status: "PENDING_REVIEW" } });

  const analystCount = await prisma.article.count({ where: { agentPersona: "ANALYST" } });
  const gossipCount = await prisma.article.count({ where: { agentPersona: "GOSSIP_GIRL" } });

  console.log("=== ARTICLE STATISTICS ===");
  console.log(`Total: ${total}`);
  console.log(`Published: ${published}, Draft: ${draft}, Pending: ${pending}`);
  console.log(`Analyst: ${analystCount}, Gossip Girl: ${gossipCount}`);

  // Cluster articles
  const clusterTotal = await prisma.clusterArticle.count();
  const clusterPublished = await prisma.clusterArticle.count({ where: { status: "PUBLISHED" } });
  console.log(`\nCluster articles: ${clusterTotal} (${clusterPublished} published)`);

  // 2. Sample articles for quality evaluation
  const sampleSize = Math.min(10, total);
  const articles = await prisma.article.findMany({
    take: sampleSize,
    orderBy: { createdAt: "desc" },
    include: { company: { select: { name: true } } },
  });

  console.log("\n=== SAMPLE ARTICLES (most recent) ===\n");
  for (const a of articles) {
    const bodyLen = a.body.length;
    const summaryLen = a.summary.length;
    const titleLen = a.title.length;
    const hasMarkdown = a.body.includes("##") || a.body.includes("#");
    const hasBlockquote = a.body.includes(">");
    const hasBulletPoints = a.body.includes("- ") || a.body.includes("* ");
    const wordCount = a.body.split(/\s+/).length;
    const analysisCount = Array.isArray(a.analysisIds) ? a.analysisIds.length : 0;

    console.log(`--- ${a.title} ---`);
    console.log(`  Company: ${a.company.name}`);
    console.log(`  Persona: ${a.agentPersona}`);
    console.log(`  Status: ${a.status}`);
    console.log(`  Created: ${a.createdAt.toISOString()}`);
    console.log(`  Title length: ${titleLen} chars`);
    console.log(`  Summary length: ${summaryLen} chars`);
    console.log(`  Body length: ${bodyLen} chars`);
    console.log(`  Word count: ${wordCount}`);
    console.log(`  Has markdown headers: ${hasMarkdown}`);
    console.log(`  Has blockquotes: ${hasBlockquote}`);
    console.log(`  Has bullet points: ${hasBulletPoints}`);
    console.log(`  Linked analyses: ${analysisCount}`);
    console.log(`  Linked inference: ${a.inferenceId ? "yes" : "no"}`);
    console.log();

    // Print first 500 chars of body for manual inspection
    console.log(`  BODY PREVIEW:`);
    console.log(`  ${a.body.substring(0, 500)}`);
    console.log();
    console.log(`  SUMMARY:`);
    console.log(`  ${a.summary}`);
    console.log();
  }

  // 3. Quality metrics across ALL articles
  const allArticles = await prisma.article.findMany({
    select: {
      id: true,
      title: true,
      body: true,
      summary: true,
      status: true,
      agentPersona: true,
      analysisIds: true,
      createdAt: true,
    },
  });

  console.log("\n=== QUALITY METRICS (all articles) ===\n");

  let emptyBody = 0;
  let veryShort = 0; // < 100 chars
  let shortBody = 0; // 100-500 chars
  let noMarkdown = 0;
  let noSummary = 0;
  let emptySummary = 0;
  let noAnalyses = 0;
  let titleTooShort = 0;
  let duplicateSlugs = new Set<string>();
  let seenSlugs = new Set<string>();

  const bodyLengths: number[] = [];
  const summaryLengths: number[] = [];
  const wordCounts: number[] = [];

  for (const a of allArticles) {
    bodyLengths.push(a.body.length);
    summaryLengths.push(a.summary.length);
    wordCounts.push(a.body.split(/\s+/).length);

    if (a.body.length === 0) emptyBody++;
    if (a.body.length < 100) veryShort++;
    if (a.body.length >= 100 && a.body.length < 500) shortBody++;
    if (!a.body.includes("##") && !a.body.includes("#")) noMarkdown++;
    if (!a.summary || a.summary.trim().length === 0) noSummary++;
    if (a.summary.trim().length < 20) emptySummary++;
    const aIds = Array.isArray(a.analysisIds) ? a.analysisIds : [];
    if (aIds.length === 0) noAnalyses++;
    if (a.title.length < 10) titleTooShort++;
    if (seenSlugs.has(a.slug)) duplicateSlugs.add(a.slug);
    seenSlugs.add(a.slug);
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const median = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  console.log(`Total articles analyzed: ${allArticles.length}`);
  console.log(`\nBody length:`);
  console.log(`  Empty (0 chars): ${emptyBody}`);
  console.log(`  Very short (<100 chars): ${veryShort}`);
  console.log(`  Short (100-500 chars): ${shortBody}`);
  console.log(`  Avg: ${Math.round(avg(bodyLengths))} chars`);
  console.log(`  Median: ${Math.round(median(bodyLengths))} chars`);
  console.log(`  Min: ${Math.min(...bodyLengths)} chars`);
  console.log(`  Max: ${Math.max(...bodyLengths)} chars`);

  console.log(`\nWord count:`);
  console.log(`  Avg: ${Math.round(avg(wordCounts))} words`);
  console.log(`  Median: ${Math.round(median(wordCounts))} words`);
  console.log(`  Min: ${Math.min(...wordCounts)} words`);
  console.log(`  Max: ${Math.max(...wordCounts)} words`);

  console.log(`\nSummary length:`);
  console.log(`  Empty: ${noSummary}`);
  console.log(`  Very short (<20 chars): ${emptySummary}`);
  console.log(`  Avg: ${Math.round(avg(summaryLengths))} chars`);
  console.log(`  Median: ${Math.round(median(summaryLengths))} chars`);

  console.log(`\nStructural quality:`);
  console.log(`  No markdown headers: ${noMarkdown}`);
  console.log(`  No linked analyses: ${noAnalyses}`);
  console.log(`  Title too short (<10 chars): ${titleTooShort}`);
  console.log(`  Duplicate slugs: ${duplicateSlugs.size}`);

  // 4. Check for hallucination indicators
  console.log("\n=== HALLUCINATION INDICATORS ===\n");

  let hasUnnamedSources = 0;
  let hasFabricatedQuotes = 0;
  let hasGenericPhrases = 0;
  let hasPlaceholderText = 0;
  let hasRepetitiveContent = 0;

  for (const a of allArticles) {
    const body = a.body.toLowerCase();

    // Check for unnamed source patterns
    if (body.includes("sources say") || body.includes("insiders say") ||
        body.includes("according to sources") || body.includes("people familiar") ||
        body.includes("a source close") || body.includes("insiders report")) {
      hasUnnamedSources++;
    }

    // Check for placeholder text
    if (body.includes("todo") || body.includes("placeholder") ||
        body.includes("insert here") || body.includes("[tbd]") ||
        body.includes("lorem ipsum") || body.includes("xxx")) {
      hasPlaceholderText++;
    }

    // Check for repetitive content (same sentence repeated)
    const sentences = body.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const uniqueSentences = new Set(sentences.map(s => s.trim()));
    if (sentences.length > 0 && uniqueSentences.size < sentences.length * 0.7) {
      hasRepetitiveContent++;
    }

    // Check for generic filler phrases
    if (body.includes("in today's fast-paced") || body.includes("in an increasingly") ||
        body.includes("it's worth noting") || body.includes("needless to say") ||
        body.includes("at the end of the day") || body.includes("moving forward")) {
      hasGenericPhrases++;
    }
  }

  console.log(`Unnamed source patterns ("sources say", "insiders report"): ${hasUnnamedSources}`);
  console.log(`Placeholder text (TODO, lorem ipsum, [tbd]): ${hasPlaceholderText}`);
  console.log(`Repetitive content (>30% sentence duplication): ${hasRepetitiveContent}`);
  console.log(`Generic filler phrases ("in today's fast-paced", etc.): ${hasGenericPhrases}`);

  // 5. Persona voice consistency check
  console.log("\n=== PERSONA VOICE CHECK ===\n");

  const analystArticles = allArticles.filter(a => a.agentPersona === "ANALYST");
  const gossipArticles = allArticles.filter(a => a.agentPersona === "GOSSIP_GIRL");

  // Check if Analyst articles have expected sections
  let analystMissingSections = 0;
  for (const a of analystArticles) {
    const hasKeyFindings = a.body.includes("Key Findings") || a.body.includes("Evidence") ||
                          a.body.includes("Strategic") || a.body.includes("Bottom Line") ||
                          a.body.includes("Implications");
    if (!hasKeyFindings) analystMissingSections++;
  }

  // Check if Gossip Girl articles have expected sections
  let gossipMissingSections = 0;
  for (const a of gossipArticles) {
    const hasGossipSections = a.body.includes("The Tell") || a.body.includes("Reading Between") ||
                              a.body.includes("The Buzz") || a.body.includes("Bottom Line") ||
                              a.body.includes("Subtext");
    if (!hasGossipSections) gossipMissingSections++;
  }

  console.log(`Analyst articles: ${analystArticles.length}`);
  console.log(`  Missing expected sections: ${analystMissingSections}`);
  console.log(`Gossip Girl articles: ${gossipArticles.length}`);
  console.log(`  Missing expected sections: ${gossipMissingSections}`);

  // 6. Check for non-English content (anti-hallucination rule)
  console.log("\n=== LANGUAGE CHECK ===\n");
  let hasNonEnglish = 0;
  const nonEnglishPattern = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/;
  for (const a of allArticles) {
    if (nonEnglishPattern.test(a.body) || nonEnglishPattern.test(a.title)) {
      hasNonEnglish++;
    }
  }
  console.log(`Articles with non-English characters (CJK): ${hasNonEnglish}`);

  // 7. Worst articles (shortest bodies)
  console.log("\n=== SHORTEST ARTICLES (potential quality issues) ===\n");
  const shortest = [...allArticles].sort((a, b) => a.body.length - b.body.length).slice(0, 5);
  for (const a of shortest) {
    console.log(`  "${a.title}" (${a.agentPersona}) - ${a.body.length} chars, ${a.body.split(/\s+/).length} words`);
    console.log(`  Body: ${a.body.substring(0, 200)}`);
    console.log();
  }

  // 8. Longest articles
  console.log("\n=== LONGEST ARTICLES ===\n");
  const longest = [...allArticles].sort((a, b) => b.body.length - a.body.length).slice(0, 5);
  for (const a of longest) {
    console.log(`  "${a.title}" (${a.agentPersona}) - ${a.body.length} chars, ${a.body.split(/\s+/).length} words`);
    console.log();
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
