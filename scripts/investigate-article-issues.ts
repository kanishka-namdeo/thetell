import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });
  const { prisma } = await import("../src/lib/db");

  console.log("=== INVESTIGATING ARTICLE ISSUES ===\n");

  // 1. Find the empty article
  const emptyArticle = await prisma.article.findFirst({
    where: { body: "" },
    include: { company: { select: { name: true } } },
  });

  if (emptyArticle) {
    console.log("EMPTY ARTICLE:");
    console.log(`  ID: ${emptyArticle.id}`);
    console.log(`  Title: "${emptyArticle.title}"`);
    console.log(`  Company: ${emptyArticle.company.name}`);
    console.log(`  Persona: ${emptyArticle.agentPersona}`);
    console.log(`  Status: ${emptyArticle.status}`);
    console.log(`  Created: ${emptyArticle.createdAt.toISOString()}`);
    console.log(`  Summary: "${emptyArticle.summary}"`);
    console.log(`  Analysis IDs: ${JSON.stringify(emptyArticle.analysisIds)}`);
    console.log();
  }

  // 2. Find duplicate slugs
  const allArticles = await prisma.article.findMany({
    select: { id: true, slug: true, title: true, createdAt: true },
  });

  const slugMap = new Map<string, typeof allArticles>();
  for (const a of allArticles) {
    if (!slugMap.has(a.slug)) {
      slugMap.set(a.slug, []);
    }
    slugMap.get(a.slug)!.push(a);
  }

  const duplicates = Array.from(slugMap.entries()).filter(([_, articles]) => articles.length > 1);
  if (duplicates.length > 0) {
    console.log("DUPLICATE SLUGS:");
    for (const [slug, articles] of duplicates) {
      console.log(`  Slug: "${slug}"`);
      for (const a of articles) {
        console.log(`    - ID: ${a.id}, Title: "${a.title}", Created: ${a.createdAt.toISOString()}`);
      }
    }
    console.log();
  }

  // 3. Find article with no markdown headers
  const noHeaders = await prisma.article.findMany({
    where: {
      body: {
        not: { contains: "##" },
      },
    },
    include: { company: { select: { name: true } } },
  });

  if (noHeaders.length > 0) {
    console.log("ARTICLES WITHOUT MARKDOWN HEADERS:");
    for (const a of noHeaders) {
      console.log(`  ID: ${a.id}`);
      console.log(`  Title: "${a.title}"`);
      console.log(`  Company: ${a.company.name}`);
      console.log(`  Persona: ${a.agentPersona}`);
      console.log(`  Body length: ${a.body.length} chars`);
      console.log(`  Body preview: ${a.body.substring(0, 300)}`);
      console.log();
    }
  }

  // 4. Find Analyst article missing expected sections
  const analystMissing = await prisma.article.findMany({
    where: { agentPersona: "ANALYST" },
    include: { company: { select: { name: true } } },
  });

  const missingSections = analystMissing.filter(
    (a) =>
      !a.body.includes("Key Findings") &&
      !a.body.includes("Evidence") &&
      !a.body.includes("Strategic") &&
      !a.body.includes("Bottom Line") &&
      !a.body.includes("Implications")
  );

  if (missingSections.length > 0) {
    console.log("ANALYST ARTICLES MISSING EXPECTED SECTIONS:");
    for (const a of missingSections) {
      console.log(`  ID: ${a.id}`);
      console.log(`  Title: "${a.title}"`);
      console.log(`  Company: ${a.company.name}`);
      console.log(`  Body preview: ${a.body.substring(0, 300)}`);
      console.log();
    }
  }

  // 5. Check for articles with very short titles
  const shortTitles = await prisma.article.findMany({
    where: {
      title: {
        lt: "          ", // 10 chars
      },
    },
    include: { company: { select: { name: true } } },
  });

  if (shortTitles.length > 0) {
    console.log("ARTICLES WITH SHORT TITLES (<10 chars):");
    for (const a of shortTitles) {
      console.log(`  ID: ${a.id}`);
      console.log(`  Title: "${a.title}" (${a.title.length} chars)`);
      console.log(`  Company: ${a.company.name}`);
      console.log();
    }
  }

  // 6. Sample a few articles to check content quality
  console.log("=== CONTENT QUALITY SAMPLE ===\n");
  const sample = await prisma.article.findMany({
    take: 3,
    orderBy: { createdAt: "desc" },
    include: { company: { select: { name: true } } },
  });

  for (const a of sample) {
    console.log(`--- ${a.title} ---`);
    console.log(`Company: ${a.company.name}`);
    console.log(`Persona: ${a.agentPersona}`);
    console.log(`Word count: ${a.body.split(/\s+/).length}`);
    console.log(`Has blockquotes: ${a.body.includes(">")}`);
    console.log(`Has bullet points: ${a.body.includes("- ") || a.body.includes("* ")}`);
    console.log(`Has bold text: ${a.body.includes("**")}`);
    console.log(`Has italic text: ${a.body.includes("*") && !a.body.includes("**")}`);
    
    // Check for common hallucination patterns
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
      a.body.toLowerCase().includes(p)
    );
    
    if (foundPatterns.length > 0) {
      console.log(`⚠️  Hallucination patterns found: ${foundPatterns.join(", ")}`);
    } else {
      console.log(`✓ No hallucination patterns detected`);
    }
    
    console.log();
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
