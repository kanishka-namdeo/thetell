import { RssScraper } from '../src/lib/scraping/rss-scraper';

async function main() {
  const scraper = new RssScraper();
  
  console.log('Testing NVIDIA IR feed...');
  const result = await scraper.scrapeFeed('https://investor.nvidia.com/rss.xml');
  
  if (result && result.items.length > 0) {
    console.log(`\nFound ${result.items.length} items`);
    console.log('\n=== First item details ===');
    const item = result.items[0];
    console.log('Title:', item.title);
    console.log('Description length:', item.description?.length || 0);
    console.log('Content length:', item.content?.length || 0);
    console.log('\nDescription:', item.description?.substring(0, 200));
  } else {
    console.log('No items or failed to fetch');
  }
}

main();
