/**
 * Test website lookup functionality for companies missing websiteUrl.
 */

import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });
  
  const { prisma } = await import("../src/lib/db");
  const { lookupWebsite } = await import("../src/lib/enrichment/website-lookup");
  const { enrichCompany } = await import("../src/lib/enrichment");

  console.log("=== Testing Website Lookup ===\n");

  // 1. Find companies without websiteUrl
  const companiesWithoutWebsite = await prisma.company.findMany({
    where: {
      websiteUrl: null
    },
    select: {
      id: true,
      name: true,
      ticker: true,
      slug: true,
    }
  });

  console.log(`Companies without websiteUrl: ${companiesWithoutWebsite.length}`);
  
  if (companiesWithoutWebsite.length === 0) {
    console.log("All companies have websiteUrl set. No testing needed.");
    await prisma.$disconnect();
    return;
  }

  // 2. Test lookup for each company
  console.log("\n=== Testing Website Lookup ===\n");
  
  for (const company of companiesWithoutWebsite) {
    console.log(`Testing: ${company.name} (ticker: ${company.ticker || "none"})`);
    
    const result = await lookupWebsite(company.name, company.ticker);
    
    if (result) {
      console.log(`  Found: ${result.websiteUrl} (confidence: ${result.confidence})`);
    } else {
      console.log(`  Not found`);
    }
  }

  // 3. Run full enrichment for one company (optional)
  console.log("\n=== Full Enrichment Test ===\n");
  
  const testCompany = companiesWithoutWebsite[0];
  if (testCompany) {
    console.log(`Running full enrichment for: ${testCompany.name}`);
    
    const enrichmentResult = await enrichCompany(testCompany.id);
    
    console.log(`  Status: ${enrichmentResult.status}`);
    console.log(`  Website: ${enrichmentResult.website?.websiteUrl || "not found"}`);
    console.log(`  Feeds: ${enrichmentResult.feeds.length}`);
    console.log(`  Ticker: ${enrichmentResult.ticker?.ticker || "not found"}`);
    
    // Verify website was saved
    const updatedCompany = await prisma.company.findUnique({
      where: { id: testCompany.id },
      select: { websiteUrl: true }
    });
    
    console.log(`  Saved websiteUrl: ${updatedCompany?.websiteUrl || "not saved"}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);