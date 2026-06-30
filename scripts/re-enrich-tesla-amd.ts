import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { prisma } = await import("../src/lib/db");
  const { enrichCompany } = await import("../src/lib/enrichment");

  // Find Tesla and AMD specifically
  const companies = await prisma.company.findMany({
    where: {
      OR: [
        { name: { contains: "Tesla" } },
        { name: { contains: "Advanced Micro Devices" } },
      ],
    },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
    },
  });

  console.log(`Found ${companies.length} companies to re-enrich:\n`);
  companies.forEach((c) => {
    console.log(`  - ${c.name} (${c.websiteUrl || "no website"})`);
  });
  console.log();

  // Run enrichment for each company
  for (const company of companies) {
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

  for (const company of companies) {
    const sourceCount = await prisma.companyDataSource.count({
      where: { companyId: company.id },
    });

    console.log(`${company.name}: ${sourceCount} data sources`);
  }

  await prisma.$disconnect();
  console.log("\n✓ Re-enrichment complete!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
