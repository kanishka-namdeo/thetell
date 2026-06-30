import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { prisma } = await import("../src/lib/db");
  const { RssScraper } = await import("../src/lib/scraping/rss-scraper");
  const { FilingScraper } = await import("../src/lib/scraping/filing-scraper");
  const { CertTransparencyScraper } = await import("../src/lib/scraping/cert-transparency-scraper");
  const { normalizeUrl, computeContentHash } = await import("../src/lib/scraping/url-normalizer");
  const { getAllFeeds } = await import("../src/lib/scraping/feed-registry");

  console.log("=== Running Signal Discovery Directly ===\n");

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      ticker: true,
      websiteUrl: true,
    },
  });

  console.log(`Found ${companies.length} companies\n`);

  let totalSignalsCreated = 0;
  let totalDuplicatesSkipped = 0;

  // Step 1: Process RSS feeds
  console.log("Step 1: Processing RSS feeds...");
  const rssScraper = new RssScraper();
  const feeds = getAllFeeds();
  console.log(`  Found ${feeds.length} feed configurations`);

  for (const companyFeed of feeds) {
    // Use fuzzy matching to find company
    const normalizedRegistryName = companyFeed.companyName.toLowerCase().replace(/\s+(inc\.?|corp\.?|ltd\.?|llc)$/i, '').trim();
    const company = companies.find(c => {
      const normalizedDbName = c.name.toLowerCase().replace(/\s+(inc\.?|corp\.?|ltd\.?|llc)$/i, '').trim();
      // Try name matching first
      if (normalizedDbName === normalizedRegistryName || 
          normalizedDbName.includes(normalizedRegistryName) || 
          normalizedRegistryName.includes(normalizedDbName)) {
        return true;
      }
      // Try ticker matching (e.g., "AMD" matches company with ticker "AMD")
      if (c.ticker && normalizedRegistryName === c.ticker.toLowerCase()) {
        return true;
      }
      return false;
    });
    
    if (!company) {
      console.log(`  Skipping ${companyFeed.companyName} - not in database`);
      continue;
    }

    for (const feed of companyFeed.feeds) {
      try {
        console.log(`  Scraping ${feed.label} for ${company.name}...`);
        const feedData = await rssScraper.scrapeFeed(feed.url);
        
        if (!feedData) {
          console.log(`    Failed to fetch feed`);
          continue;
        }

        console.log(`    Found ${feedData.items.length} items`);

        // Create data source if feed was successfully scraped
        try {
          await prisma.companyDataSource.upsert({
            where: {
              companyId_url: {
                companyId: company.id,
                url: feed.url,
              },
            },
            update: {
              validatedAt: new Date(),
            },
            create: {
              companyId: company.id,
              url: feed.url,
              sourceType: feed.sourceType || "NEWS",
              label: feed.label,
              discoveryMethod: "feed-registry",
              isActive: true,
              validatedAt: new Date(),
            },
          });
        } catch (e: any) {
          // Ignore data source creation errors
        }

        for (const item of feedData.items.slice(0, 5)) {
          if (!item.link || !item.title) continue;

          const normalizedUrl = normalizeUrl(item.link);
          const content = item.content || item.description || item.title;
          const contentHash = computeContentHash(normalizedUrl, content);

          const existing = await prisma.signal.findUnique({ where: { contentHash } });
          if (existing) {
            totalDuplicatesSkipped++;
            continue;
          }

          try {
            await prisma.signal.create({
              data: {
                sourceUrl: item.link,
                sourceType: feed.sourceType || "RSS",
                title: item.title,
                rawContent: content,
                contentHash,
                publishedAt: item.pubDate,
                companyId: company.id,
                status: "PENDING",
                verified: true,
                dataOrigin: "SCRAPED",
              },
            });
            totalSignalsCreated++;
          } catch (e: any) {
            if (e.code === "P2002") {
              totalDuplicatesSkipped++;
            }
          }
        }
      } catch (error) {
        console.log(`    Error: ${error}`);
      }
    }
  }

  // Step 2: Process SEC filings for companies with tickers
  console.log("\nStep 2: Processing SEC filings...");
  const filingScraper = new FilingScraper();
  const companiesWithTickers = companies.filter(c => c.ticker);
  console.log(`  Found ${companiesWithTickers.length} companies with tickers`);

  for (const company of companiesWithTickers) {
    try {
      console.log(`  Scraping filings for ${company.name} (${company.ticker})...`);
      const filingData = await filingScraper.scrapeFilingsByCompanyName(company.name);
      
      if (!filingData) {
        console.log(`    No filing data returned`);
        continue;
      }

      console.log(`    Found ${filingData.filings.length} filings`);

      for (const filing of filingData.filings.slice(0, 3)) {
        if (!filing.filingUrl || !filing.form) continue;

        const normalizedUrl = normalizeUrl(filing.filingUrl);
        const content = `${filing.form} - ${filing.description} filed ${filing.filingDate}`;
        const contentHash = computeContentHash(normalizedUrl, content);

        const existing = await prisma.signal.findUnique({ where: { contentHash } });
        if (existing) {
          totalDuplicatesSkipped++;
          continue;
        }

        try {
          await prisma.signal.create({
            data: {
              sourceUrl: filing.filingUrl,
              sourceType: "FILING",
              title: `${filing.form} - ${company.name} (${filing.filingDate})`,
              rawContent: content,
              contentHash,
              publishedAt: new Date(filing.filingDate),
              companyId: company.id,
              status: "PENDING",
              verified: true,
              dataOrigin: "SCRAPED",
            },
          });
          totalSignalsCreated++;
        } catch (e: any) {
          if (e.code === "P2002") {
            totalDuplicatesSkipped++;
          }
        }
      }
    } catch (error) {
      console.log(`    Error: ${error}`);
    }
  }

  // Step 3: Certificate transparency
  console.log("\nStep 3: Processing certificate transparency logs...");
  const certScraper = new CertTransparencyScraper();
  const companiesWithWebsites = companies.filter(c => c.websiteUrl);
  console.log(`  Found ${companiesWithWebsites.length} companies with websites`);

  for (const company of companiesWithWebsites) {
    try {
      const domain = company.websiteUrl!.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      console.log(`  Scraping certs for ${domain}...`);
      
      const signals = await certScraper.scrape(domain);
      console.log(`    Found ${signals.length} certificate signals`);

      for (const signal of signals.slice(0, 5)) {
        const normalizedUrl = normalizeUrl(signal.url);
        const contentHash = computeContentHash(normalizedUrl, signal.description || signal.title);

        const existing = await prisma.signal.findUnique({ where: { contentHash } });
        if (existing) {
          totalDuplicatesSkipped++;
          continue;
        }

        try {
          await prisma.signal.create({
            data: {
              sourceUrl: signal.url,
              sourceType: "TECH_SIGNAL",
              title: signal.title,
              rawContent: signal.description || signal.title,
              contentHash,
              publishedAt: signal.publishedAt,
              companyId: company.id,
              status: "PENDING",
              verified: true,
              dataOrigin: "SCRAPED",
            },
          });
          totalSignalsCreated++;
        } catch (e: any) {
          if (e.code === "P2002") {
            totalDuplicatesSkipped++;
          }
        }
      }
    } catch (error) {
      console.log(`    Error: ${error}`);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Signals created: ${totalSignalsCreated}`);
  console.log(`Duplicates skipped: ${totalDuplicatesSkipped}`);

  // Show final counts
  console.log("\n=== Final Signal Counts ===");
  for (const company of companies) {
    const count = await prisma.signal.count({ where: { companyId: company.id } });
    console.log(`  ${company.name}: ${count} signals`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
