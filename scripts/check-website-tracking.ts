/**
 * Query: How many companies have their official website in tracked sources?
 * 
 * Checks:
 * 1. Total companies with websiteUrl set
 * 2. Companies where websiteUrl appears in CompanyDataSource (being tracked)
 * 3. Breakdown by discovery method
 */

import { config } from "dotenv";

async function main() {
  // Load env vars FIRST before importing db
  config({ path: ".env.local" });
  
  const { prisma } = await import("../src/lib/db");

  console.log('=== Companies with Official Website Tracking ===\n');

  // 1. Total companies in DB
  const totalCompanies = await prisma.company.count();
  console.log(`Total companies in DB: ${totalCompanies}`);

  // 2. Companies with websiteUrl set
  const companiesWithWebsite = await prisma.company.count({
    where: {
      websiteUrl: { not: null }
    }
  });
  console.log(`Companies with websiteUrl set: ${companiesWithWebsite}`);

  // 3. Companies where websiteUrl appears in their tracked sources
  const companies = await prisma.company.findMany({
    where: {
      websiteUrl: { not: null }
    },
    select: {
      id: true,
      name: true,
      slug: true,
      websiteUrl: true,
      dataSources: {
        where: {
          isActive: true
        },
        select: {
          url: true,
          sourceType: true,
          discoveryMethod: true,
          label: true
        }
      }
    }
  });

  let matchCount = 0;
  let noMatchCount = 0;
  const matches: Array<{ name: string; website: string; sourceType: string; discoveryMethod: string }> = [];
  const noMatches: Array<{ name: string; website: string }> = [];

  for (const company of companies) {
    if (!company.websiteUrl) continue;

    // Normalize URLs for comparison (remove trailing slashes, protocol differences)
    const normalizedWebsite = company.websiteUrl
      .toLowerCase()
      .replace(/\/$/, '')
      .replace(/^https?:\/\/(www\.)?/, '');

    const matchingSource = company.dataSources.find(source => {
      const normalizedSource = source.url
        .toLowerCase()
        .replace(/\/$/, '')
        .replace(/^https?:\/\/(www\.)?/, '');
      
      // Check if source URL matches or contains the website
      return normalizedSource.includes(normalizedWebsite) || 
             normalizedWebsite.includes(normalizedSource);
    });

    if (matchingSource) {
      matchCount++;
      matches.push({
        name: company.name,
        website: company.websiteUrl,
        sourceType: matchingSource.sourceType,
        discoveryMethod: matchingSource.discoveryMethod
      });
    } else {
      noMatchCount++;
      noMatches.push({
        name: company.name,
        website: company.websiteUrl
      });
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Companies with websiteUrl tracked: ${matchCount}`);
  console.log(`Companies with websiteUrl NOT tracked: ${noMatchCount}`);
  console.log(`Percentage tracked: ${Math.round((matchCount / companiesWithWebsite) * 100)}%`);

  // 4. Show breakdown by discovery method
  const discoveryMethodBreakdown = matches.reduce((acc, m) => {
    acc[m.discoveryMethod] = (acc[m.discoveryMethod] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('\n=== Discovery Methods for Tracked Websites ===');
  Object.entries(discoveryMethodBreakdown)
    .sort((a, b) => b[1] - a[1])
    .forEach(([method, count]) => {
      console.log(`${method}: ${count}`);
    });

  // 5. Sample of matched companies
  console.log('\n=== Sample of Tracked Websites (first 10) ===');
  matches.slice(0, 10).forEach(m => {
    console.log(`${m.name}: ${m.website} (${m.discoveryMethod})`);
  });

  // 6. Sample of non-tracked companies
  console.log('\n=== Sample of Non-Tracked Websites (first 10) ===');
  noMatches.slice(0, 10).forEach(m => {
    console.log(`${m.name}: ${m.website}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);