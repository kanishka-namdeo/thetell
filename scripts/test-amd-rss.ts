import { RssScraper } from '../src/lib/scraping/rss-scraper';

async function main() {
  const scraper = new RssScraper();
  const feedUrl = 'https://community.amd.com/t5/custom/page/page-id/rss';
  
  console.log(`Testing RSS feed: ${feedUrl}`);
  
  try {
    const result = await scraper.scrapeFeed(feedUrl);
    console.log('Feed result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error scraping feed:', error);
  }
}

main();
