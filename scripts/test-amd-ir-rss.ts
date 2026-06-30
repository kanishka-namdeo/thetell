import { RssScraper } from '../src/lib/scraping/rss-scraper';

async function main() {
  const scraper = new RssScraper();
  
  // Test AMD Investor Relations RSS feeds
  const feeds = [
    { url: 'https://ir.amd.com/news-events/press-releases/rss', label: 'AMD IR Press Releases' },
    { url: 'https://ir.amd.com/financial-information/sec-filings/rss', label: 'AMD IR SEC Filings' },
  ];
  
  for (const feed of feeds) {
    console.log(`\n=== Testing: ${feed.label} ===`);
    console.log(`URL: ${feed.url}`);
    
    try {
      const result = await scraper.scrapeFeed(feed.url);
      if (result) {
        console.log(`✅ SUCCESS - Found ${result.items.length} items`);
        console.log(`Feed title: ${result.title}`);
        if (result.items.length > 0) {
          console.log(`Latest item: ${result.items[0].title}`);
        }
      } else {
        console.log('❌ No result returned');
      }
    } catch (error) {
      console.error('❌ Error:', error);
    }
  }
}

main();
