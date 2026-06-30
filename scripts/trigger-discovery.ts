import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { inngest } = await import("../src/lib/inngest/client");

  console.log("Triggering unified signal discovery for all companies...\n");

  try {
    await inngest.send({
      name: "signal/discovery.requested",
      data: {
        companyIds: "all",
        mode: "manual",
        hypothesisAware: true,
        stealthFallback: false,
      },
    });

    console.log("✓ Discovery job triggered successfully");
    console.log("\nThe unified discovery pipeline will now run through Inngest.");
    console.log("Check the Inngest dashboard at http://localhost:8288 to monitor progress.");
    console.log("\nThis will run 22 scraper steps including:");
    console.log("  - RSS feeds from company data sources");
    console.log("  - SEC EDGAR filings (for companies with tickers)");
    console.log("  - GitHub activity");
    console.log("  - Certificate transparency logs");
    console.log("  - Reddit financial discussions");
    console.log("  - Press releases");
    console.log("  - USPTO patents");
    console.log("  - Court litigation");
    console.log("  - FDA drug events");
    console.log("  - Government contracts");
    console.log("  - Wayback Machine changes");
    console.log("  - Congress legislation");
    console.log("  - Academic papers");
    console.log("  - Lobbying disclosures");
    console.log("  - Supplier earnings");
    console.log("  - Executive appearances");
    console.log("  - App Store updates");
    console.log("  - Conference agendas");
    console.log("  - Domain registrations");
    console.log("  - Dynamic URL discovery via web search");
  } catch (error) {
    console.error("✗ Failed to trigger discovery:", error);
    process.exit(1);
  }
}

main();
