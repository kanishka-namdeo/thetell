import { RssScraper } from '../src/lib/scraping/rss-scraper';

async function testRssFix() {
  const scraper = new RssScraper();
  
  console.log('=== Testing RSS fix with TechCrunch (no content:encoded) ===\n');
  
  // Test WITHOUT fetchFullArticles (old behavior)
  console.log('1. WITHOUT fetchFullArticles (old behavior):');
  const feedWithout = await scraper.scrapeFeed('https://techcrunch.com/feed/', { fetchFullArticles: false });
  
  if (feedWithout && feedWithout.items.length > 0) {
    const item = feedWithout.items[0];
    console.log(`   Title: ${item.title}`);
    console.log(`   Content length: ${item.content.length} chars`);
    console.log(`   Preview: ${item.content.substring(0, 150)}...`);
  }
  
  console.log('\n2. WITH fetchFullArticles (new behavior):');
  const feedWith = await scraper.scrapeFeed('https://techcrunch.com/feed/', { fetchFullArticles: true });
  
  if (feedWith && feedWith.items.length > 0) {
    const item = feedWith.items[0];
    console.log(`   Title: ${item.title}`);
    console.log(`   Content length: ${item.content.length} chars`);
    console.log(`   Preview: ${item.content.substring(0, 300)}...`);
    
    // Show improvement
    const oldItem = feedWithout?.items[0];
    if (oldItem) {
      const improvement = ((item.content.length / oldItem.content.length) * 100).toFixed(1);
      console.log(`\n   ✅ Content improved by ${improvement}% (${oldItem.content.length} → ${item.content.length} chars)`);
    }
  }
  
  console.log('\n=== Testing with Ars Technica (has content:encoded) ===\n');
  const arsFeed = await scraper.scrapeFeed('https://feeds.arstechnica.com/arstechnica/index', { fetchFullArticles: true });
  
  if (arsFeed && arsFeed.items.length > 0) {
    const item = arsFeed.items[0];
    console.log(`Title: ${item.title}`);
    console.log(`Content length: ${item.content.length} chars`);
    console.log(`Preview: ${item.content.substring(0, 200)}...`);
    console.log(`\n✅ Ars Technica already has full content, no fetch needed`);
  }
}

testRssFix().catch(console.error).finally(() => process.exit(0));
