import { NewsScraper } from '../src/lib/scraping/news-scraper';

async function testNewsScraper() {
  const scraper = new NewsScraper();
  
  // Test with a real news article
  const testUrl = 'https://www.bbc.com/news/technology-681234567';
  
  console.log(`Testing NewsScraper with URL: ${testUrl}`);
  
  try {
    const result = await scraper.scrapeArticle(testUrl);
    
    if (result) {
      console.log('✓ Scraper returned data:');
      console.log(`  Title: ${result.title}`);
      console.log(`  Author: ${result.author || 'Not found'}`);
      console.log(`  Published: ${result.publishedAt || 'Not found'}`);
      console.log(`  Body length: ${result.bodyText.length} chars`);
      console.log(`  Description: ${result.description || 'Not found'}`);
      console.log(`  Metadata keys: ${Object.keys(result.metadata).join(', ')}`);
      
      if (result.bodyText.length < 100) {
        console.warn('⚠ Warning: Body text is very short');
      }
    } else {
      console.log('✗ Scraper returned null');
    }
  } catch (error) {
    console.error('✗ Scraper threw error:', error);
  }
}

testNewsScraper().catch(console.error);
