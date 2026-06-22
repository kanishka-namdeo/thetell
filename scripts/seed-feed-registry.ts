import { prisma } from "../src/lib/db";
import { getAllFeeds } from "../src/lib/scraping/feed-registry";

async function seedFeedRegistry() {
  console.log("Starting feed registry migration...");

  const feeds = getAllFeeds();
  let created = 0;
  let skipped = 0;
  let notFound = 0;

  for (const companyFeed of feeds) {
    const company = await prisma.company.findFirst({
      where: {
        OR: [
          { slug: companyFeed.companyId },
          { slug: companyFeed.companyId.toLowerCase().replace(/\s+/g, "-") },
        ],
      },
    });

    if (!company) {
      console.warn(`Company not found for ID: ${companyFeed.companyId}`);
      notFound++;
      continue;
    }

    console.log(`Processing ${company.name} (${company.id})...`);

    for (const feed of companyFeed.feeds) {
      try {
        await prisma.companyDataSource.upsert({
          where: {
            companyId_url: {
              companyId: company.id,
              url: feed.url,
            },
          },
          update: {},
          create: {
            companyId: company.id,
            url: feed.url,
            sourceType: (feed.sourceType || "RSS") as any,
            label: feed.label,
            discoveryMethod: "seed",
            isActive: true,
            validatedAt: new Date(),
          },
        });
        created++;
      } catch (error) {
        console.error(`Failed to create data source for ${feed.url}:`, error);
        skipped++;
      }
    }
  }

  console.log("\nMigration complete:");
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Companies not found: ${notFound}`);

  await prisma.$disconnect();
}

seedFeedRegistry().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
