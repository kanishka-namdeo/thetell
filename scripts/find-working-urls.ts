import * as cheerio from 'cheerio';

async function testUrl(label: string, url: string) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    const text = await r.text();
    console.log(`\n${label} [${r.status}] len=${text.length}`);
    if (r.status !== 200) return;
    
    const $ = cheerio.load(text);
    
    // News scraper selectors
    const ogTitle = $('meta[property="og:title"]').attr('content');
    const schemaHeadline = $('[itemprop="headline"]').first().text().trim();
    const h1 = $('h1').first().text().trim();
    const title = $('title').first().text().trim();
    
    // Body extraction (same as NewsScraper)
    $('script, style, nav, header, footer, aside, iframe').remove();
    const articleBodySelectors = [
      '[itemprop="articleBody"]',
      '[class*="article-body"], [class*="post-content"], [class*="entry-content"], [class*="story-body"]',
      '[class*="article__body"], [class*="content-body"]',
    ];
    let bodyText = '';
    for (const sel of articleBodySelectors) {
      const body = $(sel).first();
      if (body.length) {
        const t = body.find('p').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 0).join('\n\n');
        if (t.length > 100) { bodyText = t; break; }
      }
    }
    if (!bodyText) {
      const article = $('article').first();
      if (article.length) {
        article.find('nav, aside, footer, figure, img, video').remove();
        const t = article.find('p').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 0).join('\n\n');
        if (t.length > 100) bodyText = t;
      }
    }
    if (!bodyText) {
      bodyText = $('p').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 0).join('\n\n');
    }
    
    console.log(`  title: "${(ogTitle || schemaHeadline || h1 || title || '').slice(0, 80)}"`);
    console.log(`  bodyLen: ${bodyText.length}`);
    
    // Job scraper selectors
    const ghAppH1 = $('#app h1, .app h1').first().text().trim();
    const ogSiteName = $('meta[property="og:site_name"]').attr('content');
    const jobTitle = $('h1').first().text().trim();
    const jobLocation = $('.location, .office-location').first().text().trim() || $('[data-location]').attr('data-location') || '';
    
    if (url.includes('greenhouse') || url.includes('lever')) {
      console.log(`  GH #app h1: "${ghAppH1.slice(0, 60)}"`);
      console.log(`  og:site_name: "${ogSiteName}"`);
      console.log(`  job title: "${jobTitle.slice(0, 60)}"`);
      console.log(`  location: "${jobLocation.slice(0, 60)}"`);
    }
    
    // RSS check
    const isRss = text.includes('<rss') || text.includes('<feed') || text.includes('<channel>');
    const itemCount = (text.match(/<item[\s>]/g) || []).length;
    const entryCount = (text.match(/<entry[\s>]/g) || []).length;
    if (isRss || itemCount > 0 || entryCount > 0) {
      console.log(`  RSS items: ${itemCount}, Atom entries: ${entryCount}`);
    }
    
  } catch (e) {
    console.log(`${label} ERROR: ${(e as Error).message}`);
  }
}

async function main() {
  console.log('=== NEWS SCRAPER - Real Article URLs ===');
  
  // Try real article URLs from accessible sites
  await testUrl('NPR-1', 'https://www.npr.org/2024/12/20/nx-s1-5229873/christmas-storm-weather');
  await testUrl('NPR-2', 'https://www.npr.org/2025/01/09/nx-s1-5242617/california-wildfires');
  await testUrl('AP-1', 'https://apnews.com/article/trump-biden-election-2024');
  await testUrl('BBC-1', 'https://www.bbc.com/news/articles/cly4z0vd2lzo');
  await testUrl('NBC-1', 'https://www.nbcnews.com/business/economy');
  await testUrl('CNBC-1', 'https://www.cnbc.com/2025/01/10/us-economy-2025-outlook.html');
  await testUrl('CBS-1', 'https://www.cbsnews.com/news/federal-reserve-interest-rates/');
  await testUrl('Guardian-1', 'https://www.theguardian.com/business/2024/jun/15/test');
  
  console.log('\n=== JOB SCRAPER - Real Job Posting URLs ===');
  
  // Try real job posting URLs
  await testUrl('GH-Stripe-1', 'https://boards.greenhouse.io/stripe/jobs/6842801');
  await testUrl('GH-Stripe-2', 'https://boards.greenhouse.io/stripe/jobs/7111678002');
  await testUrl('GH-Stripe-3', 'https://boards.greenhouse.io/embed/job_app?token=6842801');
  await testUrl('GH-Airbnb-1', 'https://boards.greenhouse.io/airbnb/jobs/6842801');
  await testUrl('Lever-Stripe-1', 'https://jobs.lever.co/stripe/abc123');
  
  console.log('\n=== PRESS RELEASE - Working RSS Feeds ===');
  
  // Try working RSS feeds
  await testUrl('FTC-News', 'https://www.ftc.gov/feeds/press-release-consumer-protection.xml');
  await testUrl('Apple-Newsroom', 'https://www.apple.com/newsroom/rss-feed.rss');
  await testUrl('Google-Blog', 'https://blog.google/rss/');
  await testUrl('Microsoft-Blog', 'https://blogs.microsoft.com/feed/');
  await testUrl('GitHub-Blog', 'https://github.blog/feed/');
}

main().catch(console.error);
