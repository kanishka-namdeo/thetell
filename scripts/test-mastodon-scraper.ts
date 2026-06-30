/**
 * Test script for Mastodon social signals scraping.
 * Runs the MastodonScraper against real companies in the database.
 * No mocking or simulation — actual API calls to Mastodon instances.
 *
 * Run with: pnpm dlx tsx scripts/test-mastodon-scraper.ts
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { MastodonScraper } from '../src/lib/scraping/mastodon-scraper';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });
import { logger } from '../src/lib/logger';

async function main() {
  console.log('\n=== Mastodon Scraper Test ===\n');

  // Get companies with tickers from the database
  const companies = await prisma.company.findMany({
    where: { ticker: { not: null } },
    select: { id: true, name: true, ticker: true },
    take: 5, // Test with first 5 companies
  });

  if (companies.length === 0) {
    console.log('No companies with tickers found in database. Exiting.');
    return;
  }

  console.log(`Testing with ${companies.length} companies:`);
  companies.forEach(c => console.log(`  - ${c.name} (${c.ticker})`));
  console.log('');

  const tickers = companies.map(c => c.ticker!).filter((t): t is string => t !== null);
  const scraper = new MastodonScraper();

  console.log('Tracked instances:', scraper.getTrackedInstances().join(', '));
  console.log('');

  // Run the scraper
  console.log('Starting scrape...');
  const startTime = Date.now();

  try {
    const signals = await scraper.scrape(tickers, { limit: 30 });

    const elapsed = Date.now() - startTime;
    console.log(`\nScrape completed in ${elapsed}ms`);
    console.log(`Found ${signals.length} signals\n`);

    if (signals.length === 0) {
      console.log('WARNING: No signals found. This could mean:');
      console.log('  1. No company mentions on tracked Mastodon instances');
      console.log('  2. Network connectivity issues');
      console.log('  3. API endpoints changed');
      return;
    }

    // Display results
    console.log('Sample signals:');
    signals.slice(0, 5).forEach((signal, i) => {
      console.log(`\n  Signal ${i + 1}:`);
      console.log(`    URL: ${signal.url}`);
      console.log(`    Author: ${signal.author}`);
      console.log(`    Body: ${signal.bodyText.slice(0, 100)}...`);
      console.log(`    Instance: ${(signal.metadata as any)?.instance || 'unknown'}`);
      console.log(`    Published: ${signal.publishedAt?.toISOString() || 'unknown'}`);
      console.log(`    Engagement: likes=${signal.engagement.likes}, retweets=${signal.engagement.retweets}, replies=${signal.engagement.replies}`);
    });

    // Count signals by instance
    const byInstance = new Map<string, number>();
    signals.forEach(s => {
      const instance = (s.metadata as any)?.instance || 'unknown';
      byInstance.set(instance, (byInstance.get(instance) || 0) + 1);
    });

    console.log('\nSignals by instance:');
    byInstance.forEach((count, instance) => {
      console.log(`  ${instance}: ${count}`);
    });

    // Count signals by source
    const bySource = new Map<string, number>();
    signals.forEach(s => {
      const source = (s.metadata as any)?.source || 'unknown';
      bySource.set(source, (bySource.get(source) || 0) + 1);
    });

    console.log('\nSignals by source type:');
    bySource.forEach((count, source) => {
      console.log(`  ${source}: ${count}`);
    });

  } catch (error) {
    console.error('ERROR:', error instanceof Error ? error.message : error);
    throw error;
  }
}

main()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch(error => {
    console.error('\nFatal error:', error);
    process.exit(1);
  });
