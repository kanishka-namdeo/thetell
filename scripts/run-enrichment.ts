import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { prisma } = await import("../src/lib/db");
  const { enrichCompany } = await import("../src/lib/enrichment");

  // Find companies with zero data sources
  const companiesWithoutSources = await prisma.company.findMany({
    where: {
      dataSources: {
        none: {},
      },
    },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
    },
  });

  console.log(`Found ${companiesWithoutSources.length} companies without data sources:\n`);
  companiesWithoutSources.forEach((c) => {
    console.log(`  - ${c.name} (${c.websiteUrl || "no website"})`);
  });
  console.log();

  if (companiesWithoutSources.length === 0) {
    console.log("All companies already have data sources.");
    await prisma.$disconnect();
    return;
  }

  // Run enrichment for each company
  for (const company of companiesWithoutSources) {
    console.log(`\nEnriching ${company.name}...`);
    console.log("=".repeat(50));

    try {
      const result = await enrichCompany(company.id);

      console.log(`\n✓ Enrichment complete for ${company.name}`);
      console.log(`  Status: ${result.status}`);
      console.log(`  Feeds discovered: ${result.feeds.length}`);
      console.log(`  Blogs discovered: ${result.blogs.length}`);
      console.log(`  Social profiles: ${result.socials.length}`);
      console.log(`  Ticker: ${result.ticker?.ticker || "not found"}`);

      if (result.error) {
        console.log(`  ⚠ Error: ${result.error}`);
      }
    } catch (error) {
      console.error(`\n✗ Failed to enrich ${company.name}:`);
      console.error(error);
    }
  }

  // Verify results
  console.log("\n\nVerifying data sources created...");
  console.log("=".repeat(50));

  for (const company of companiesWithoutSources) {
    const sourceCount = await prisma.companyDataSource.count({
      where: { companyId: company.id },
    });

    console.log(`${company.name}: ${sourceCount} data sources`);
  }

  await prisma.$disconnect();
  console.log("\n✓ Enrichment complete!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
