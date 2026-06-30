/**
 * Enrich all companies missing websiteUrl.
 */

import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });
  
  const { prisma } = await import("../src/lib/db");
  const { enrichCompany } = await import("../src/lib/enrichment");

  console.log("=== Enriching Companies Missing websiteUrl ===\n");

  // Find all companies without websiteUrl
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      websiteUrl: true,
      ticker: true,
    }
  });

  const companiesToEnrich = companies.filter(c => !c.websiteUrl);
  
  console.log(`Found ${companiesToEnrich.length} companies to enrich:\n`);
  companiesToEnrich.forEach(c => console.log(`  - ${c.name} (${c.slug})`));

  // Enrich each company
  for (const company of companiesToEnrich) {
    console.log(`\n=== Enriching: ${company.name} ===`);
    
    try {
      const result = await enrichCompany(company.id);
      
      console.log(`Status: ${result.status}`);
      console.log(`Website: ${result.website?.websiteUrl || "not found"}`);
      console.log(`Ticker: ${result.ticker?.ticker || "not found"}`);
      console.log(`Feeds: ${result.feeds.length}`);
      console.log(`Socials: ${result.socials.length}`);
      console.log(`Blogs: ${result.blogs.length}`);
      
      // Verify saved data
      const updated = await prisma.company.findUnique({
        where: { id: company.id },
        select: { websiteUrl: true, ticker: true }
      });
      
      console.log(`Saved website: ${updated?.websiteUrl || "none"}`);
      console.log(`Saved ticker: ${updated?.ticker || "none"}`);
    } catch (error) {
      console.error(`Error enriching ${company.name}: ${error}`);
    }
  }

  // Final count
  const finalCount = await prisma.company.count({
    where: { websiteUrl: null }
  });
  
  console.log(`\n=== Summary ===`);
  console.log(`Companies still missing websiteUrl: ${finalCount}`);
  console.log(`Successfully enriched: ${companiesToEnrich.length - finalCount}`);

  await prisma.$disconnect();
}

main().catch(console.error);