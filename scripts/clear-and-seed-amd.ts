import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { RssScraper } from '../src/lib/scraping/rss-scraper';
import { getFeedsByCompanyId } from '../src/lib/scraping/feed-registry';
import { SourceType, DataOrigin, SignalStatus } from '@prisma/client';
import { createHash } from 'crypto';

config({ path: resolve(__dirname, '../.env.local') });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function computeContentHash(url: string, content: string): string {
  return createHash('sha256').update(url + content).digest('hex');
}

async function main() {
  console.log('=== Clearing AMD signals and re-seeding ===\n');
  
  // Find AMD company
  const amd = await prisma.company.findUnique({ where: { slug: 'amd' } });
  if (!amd) {
    console.log('AMD company not found');
    return;
  }
  
  console.log(`Found AMD: ${amd.name} (${amd.id})`);
  
  // Delete existing AMD signals
  const deleted = await prisma.signal.deleteMany({
    where: { companyId: amd.id }
  });
  console.log(`Deleted ${deleted.count} existing AMD signals\n`);
  
  // Get AMD feeds
  const feedConfig = getFeedsByCompanyId('amd');
  if (!feedConfig) {
    console.log('No feeds found for AMD');
    return;
  }
  
  console.log(`Found ${feedConfig.feeds.length} feed(s) for AMD`);
  
  const scraper = new RssScraper();
  let totalSignals = 0;
  
  for (const feed of feedConfig.feeds) {
    console.log(`\n  -> ${feed.label} (${feed.url})`);
    
    try {
      const feedData = await scraper.scrapeFeed(feed.url);
      if (!feedData || feedData.items.length === 0) {
        console.log('     No items returned');
        continue;
      }
      
      console.log(`     Parsed ${feedData.items.length} item(s)`);
      
      for (const item of feedData.items.slice(0, 5)) {
        let rawContent = stripHtml(item.content || item.description || '');
        
        // For link-only RSS feeds, fetch the linked page content
        if ((!rawContent || rawContent.length < 50) && item.link) {
          try {
            console.log(`     - fetching content from: ${item.link.slice(0, 50)}...`);
            const pageContent = await scraper.fetch(item.link);
            if (pageContent) {
              rawContent = stripHtml(pageContent).slice(0, 2000);
            }
          } catch (e) {
            console.log(`     - failed to fetch: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        
        if (!item.link || !rawContent || rawContent.length < 50) {
          console.log(`     - skip (insufficient content): "${(item.title || '').slice(0, 40)}"`);
          continue;
        }
        
        const contentHash = computeContentHash(item.link, rawContent);
        const rawContentHash = createHash('sha256').update(rawContent).digest('hex');
        
        // Check for duplicates
        const existing = await prisma.signal.findUnique({ where: { contentHash } });
        if (existing) {
          console.log(`     - skip (duplicate)`);
          continue;
        }
        
        // Create signal
        await prisma.signal.create({
          data: {
            sourceUrl: item.link,
            sourceType: feed.sourceType === 'NEWS' ? SourceType.NEWS : SourceType.NEWS,
            title: item.title || 'Untitled',
            rawContent,
            contentHash,
            publishedAt: item.pubDate,
            companyId: amd.id,
            status: SignalStatus.PENDING,
            scraperName: 'rss-scraper',
            verified: true,
            dataOrigin: DataOrigin.BOOTSTRAP,
            feedLabel: feed.label,
            scrapeAttempts: 1,
            rawContentHash,
          },
        });
        
        totalSignals++;
        console.log(`     - created signal: "${(item.title || '').slice(0, 50)}"`);
      }
    } catch (error) {
      console.log(`     ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  console.log(`\n=== Complete ===`);
  console.log(`Created ${totalSignals} new signals for AMD`);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
