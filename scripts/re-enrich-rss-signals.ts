import { prisma } from '../src/lib/db';
import * as cheerio from 'cheerio';
import { BaseScraper } from '../src/lib/scraping/base-scraper';

/**
 * Re-enrich existing RSS signals that have short content.
 * Fetches full articles directly from sourceUrl.
 */
class ReEnrichmentScraper extends BaseScraper {
  constructor() {
    super(1.0, 30000, 3, 86400, true);
  }

  get scraperName(): string {
    return 're-enrichment-scraper';
  }

  async fetchArticle(url: string): Promise<string | null> {
    const html = await this.fetch(url);
    if (!html) return null;

    const $ = cheerio.load(html);
    return this.extractArticleContent($);
  }

  private extractArticleContent($: cheerio.CheerioAPI): string {
    const selectors = [
      '[itemprop="articleBody"]',
      '.entry-content',
      '.post-content',
      '.article-content',
      '.article-body',
      '.story-body',
      'article',
      'main',
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        const clone = element.clone();
        clone.find('script, style, nav, footer, header, .sidebar, .ads, .comments, .share').remove();
        const html = clone.html()?.trim() || '';
        if (html.length > 200) {
          return html;
        }
      }
    }

    let maxLength = 0;
    let bestText = '';

    $('p, div').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > maxLength && text.length > 200) {
        maxLength = text.length;
        bestText = text;
      }
    });

    return bestText;
  }
}

async function reEnrichRssSignals() {
  const CONTENT_THRESHOLD = 500;
  
  console.log('=== RSS Signal Re-enrichment Script ===\n');
  
  // Fetch all RSS signals and filter in JavaScript (Prisma doesn't support length filtering)
  const allRssSignals = await prisma.signal.findMany({
    where: {
      scraperName: 'rss-scraper'
    },
    select: {
      id: true,
      sourceUrl: true,
      title: true,
      rawContent: true,
    }
  });
  
  const shortSignals = allRssSignals.filter(s => 
    !s.rawContent || s.rawContent.length < CONTENT_THRESHOLD
  );
  
  console.log(`Found ${shortSignals.length} signals with content < ${CONTENT_THRESHOLD} chars\n`);
  
  if (shortSignals.length === 0) {
    console.log('No signals need re-enrichment.');
    return;
  }
  
  console.log('Signals to re-enrich:');
  shortSignals.slice(0, 10).forEach(s => {
    console.log(`  - [${s.rawContent.length} chars] ${s.title.substring(0, 60)}`);
  });
  if (shortSignals.length > 10) {
    console.log(`  ... and ${shortSignals.length - 10} more\n`);
  }
  
  console.log('\nStarting re-enrichment...\n');
  
  const scraper = new ReEnrichmentScraper();
  let updated = 0;
  let failed = 0;
  
  for (const signal of shortSignals) {
    try {
      console.log(`Processing: ${signal.title.substring(0, 60)}...`);
      
      const fullContent = await scraper.fetchArticle(signal.sourceUrl);
      
      if (!fullContent || fullContent.length <= signal.rawContent.length) {
        console.log(`  ⚠️  No improvement (${signal.rawContent.length} → ${fullContent?.length || 0})`);
        failed++;
        continue;
      }
      
      await prisma.signal.update({
        where: { id: signal.id },
        data: { rawContent: fullContent }
      });
      
      console.log(`  ✅ Updated (${signal.rawContent.length} → ${fullContent.length} chars)`);
      updated++;
      
    } catch (error) {
      console.error(`  ❌ Error: ${error}`);
      failed++;
    }
  }
  
  console.log('\n=== Re-enrichment Complete ===');
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${shortSignals.length}`);
}

reEnrichRssSignals()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
