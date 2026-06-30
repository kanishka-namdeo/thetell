import { BaseScraper } from '../src/lib/scraping/base-scraper';

class TestScraper extends BaseScraper {
  constructor() {
    super(1.0, 30000, 3, 3600);
  }
  
  get scraperName(): string {
    return "test-scraper";
  }
  
  async fetchRaw(url: string): Promise<string | null> {
    return await this.fetch(url);
  }
}

async function main() {
  const scraper = new TestScraper();
  
  console.log('Fetching AMD SEC filings RSS...');
  const xml = await scraper.fetchRaw('https://ir.amd.com/financial-information/sec-filings/rss');
  
  if (xml) {
    console.log('\n=== Raw XML (first 4000 chars) ===');
    console.log(xml.substring(0, 4000));
  } else {
    console.log('Failed to fetch');
  }
}

main();
