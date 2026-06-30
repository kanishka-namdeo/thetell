import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });
  const { prisma } = await import("../src/lib/db");

  console.log("=== HEADER FORMATTING CHECK ===\n");

  const articles = await prisma.article.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, body: true, agentPersona: true },
  });

  for (const a of articles) {
    console.log(`--- ${a.title} (${a.agentPersona}) ---`);
    
    // Find all ## occurrences
    const headerMatches = [...a.body.matchAll(/##\s+[^#\n]+/g)];
    console.log(`  Headers found: ${headerMatches.length}`);
    
    for (const m of headerMatches) {
      console.log(`    "${m[0].trim()}"`);
    }
    
    // Check if headers have newlines after them
    const hasNewlineAfterHeader = /##\s+[^\n]+\n/.test(a.body);
    console.log(`  Headers have newline after: ${hasNewlineAfterHeader}`);
    
    // Check if headers are concatenated with content (no newline)
    const concatenatedHeaders = /##\s+[^\n]+[A-Z]/.test(a.body);
    console.log(`  Headers concatenated with content: ${concatenatedHeaders}`);
    
    // Show first 400 chars with visible newlines
    console.log(`\n  RAW BODY (first 400 chars, \\n shown as ⏎):`);
    console.log(`  ${a.body.substring(0, 400).replace(/\n/g, "⏎")}`);
    console.log();
  }

  // Count how many articles have this issue
  const allArticles = await prisma.article.findMany({
    select: { id: true, body: true, title: true },
  });

  let concatenatedCount = 0;
  let properNewlineCount = 0;
  let noHeadersCount = 0;

  for (const a of allArticles) {
    if (!a.body.includes("##")) {
      noHeadersCount++;
      continue;
    }
    
    const hasConcatenated = /##\s+[^\n]+[A-Za-z]/.test(a.body);
    const hasProperNewline = /##\s+[^\n]+\n/.test(a.body);
    
    if (hasConcatenated) concatenatedCount++;
    if (hasProperNewline) properNewlineCount++;
  }

  console.log("\n=== HEADER FORMATTING SUMMARY ===");
  console.log(`Total articles: ${allArticles.length}`);
  console.log(`No headers at all: ${noHeadersCount}`);
  console.log(`Headers concatenated with content (no newline): ${concatenatedCount}`);
  console.log(`Headers with proper newline: ${properNewlineCount}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
