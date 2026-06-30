/**
 * Trigger wayback-only re-discovery for companies with existing wayback signals.
 * Re-runs the wayback scraper pipeline with the new enriched content logic.
 */
import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { prisma } = await import("../src/lib/db");
  const { inngest } = await import("../src/lib/inngest/client");

  console.log("=== Wayback Scraper Re-Run ===\n");

  // Find companies with website URLs (needed for wayback scraping)
  const companies = await prisma.company.findMany({
    where: { websiteUrl: { not: null } },
    select: { id: true, name: true, websiteUrl: true },
  });

  console.log(`Found ${companies.length} companies with websites:`);
  for (const c of companies) {
    console.log(`  - ${c.name} (${c.websiteUrl})`);
  }

  if (companies.length === 0) {
    console.log("No companies with websites found. Exiting.");
    process.exit(0);
  }

  const companyIds = companies.map((c) => c.id);

  console.log("\nTriggering wayback-only discovery pipeline...");
  console.log(`Companies: ${companyIds.length}`);
  console.log("Scraper filter: wayback only\n");

  try {
    await inngest.send({
      name: "signal/discovery.requested",
      data: {
        companyIds,
        scrapers: ["wayback"],
        mode: "manual",
        hypothesisAware: false,
        stealthFallback: false,
      },
    });

    console.log("✓ Wayback discovery job triggered successfully");
    console.log("\nMonitor progress at:");
    console.log("  - Inngest dashboard: http://localhost:8288");
    console.log("  - Dev server logs: terminal running pnpm dev");
    console.log("\nWhat to expect:");
    console.log("  - Wayback Machine CDX API queries for each company domain");
    console.log("  - New signals with enriched content (page type detection)");
    console.log("  - Analysis pipeline with WEB_ARCHIVE-specific prompts");
    console.log("  - Relaxed hallucination guard for wayback facts");
    console.log("  - Wayback-specific confidence scoring");

    process.exit(0);
  } catch (error) {
    console.error("✗ Failed to trigger discovery:", error);
    process.exit(1);
  }
}

main();
