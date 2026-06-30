import { BaseScraper } from '../src/lib/scraping/base-scraper';

class TestScraper extends BaseScraper {
  constructor() {
    super(1.0, 30000, 3, 3600);
  }
  
  get scraperName(): string {
    return "test-scraper";
  }
  
  async fetchPage(url: string): Promise<string | null> {
    return await this.fetch(url);
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function main() {
  const scraper = new TestScraper();
  
  const url = 'https://ir.amd.com/news-events/press-releases/detail/1288/amd-commits-up-to-2-billion-to-accelerate-ai-innovation-and-research-in-the-united-kingdom';
  console.log(`Fetching: ${url}`);
  
  const html = await scraper.fetchPage(url);
  
  if (html) {
    console.log('\n=== HTML (first 2000 chars) ===');
    console.log(html.substring(0, 2000));
    
    const text = stripHtml(html);
    console.log('\n=== Text content (first 1000 chars) ===');
    console.log(text.substring(0, 1000));
    console.log(`\nTotal text length: ${text.length}`);
  } else {
    console.log('Failed to fetch');
  }
}

main();
