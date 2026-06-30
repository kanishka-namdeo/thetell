import { RssScraper } from '../src/lib/scraping/rss-scraper';

async function testRssContent() {
  const scraper = new RssScraper();
  
  // Test with a real RSS feed that should have content:encoded
  const testFeeds = [
    'https://feeds.reuters.com/reuters/businessNews',
    'https://www.cnbc.com/id/10001147/device/rss/rss.html',
  ];

  for (const feedUrl of testFeeds) {
    console.log(`\n=== Testing: ${feedUrl} ===`);
    const result = await scraper.scrapeFeed(feedUrl);
    
    if (!result) {
      console.log('Failed to fetch feed');
      continue;
    }

    console.log(`Feed title: ${result.title}`);
    console.log(`Items found: ${result.items.length}`);
    
    if (result.items.length > 0) {
      const item = result.items[0];
      console.log('\nFirst item:');
      console.log(`  Title: ${item.title}`);
      console.log(`  Link: ${item.link}`);
      console.log(`  Description length: ${item.description.length}`);
      console.log(`  Content length: ${item.content.length}`);
      console.log(`  Description preview: ${item.description.substring(0, 200)}`);
      console.log(`  Content preview: ${item.content.substring(0, 200)}`);
      
      // Check if content is just description
      if (item.content === item.description) {
        console.log('  ⚠️  Content equals description (no full content extracted)');
      } else if (item.content.length > item.description.length) {
        console.log(`  ✅ Content is longer than description (${item.content.length} vs ${item.description.length})`);
      }
    }
  }
}

testRssContent().catch(console.error);
