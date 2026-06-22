import * as cheerio from 'cheerio';

async function testUrl(label, url) {
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
    
    // Body extraction
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
    if (url.includes('greenhouse') || url.includes('lever')) {
      console.log(`  GH #app h1: "${ghAppH1.slice(0, 60)}"`);
      console.log(`  og:site_name: "${ogSiteName}"`);
    }
    
    // RSS check
    const isRss = text.includes('<rss') || text.includes('<feed') || text.includes('<channel>');
    const itemCount = (text.match(/<item[\s>]/g) || []).length;
    const entryCount = (text.match(/<entry[\s>]/g) || []).length;
    if (isRss || itemCount > 0 || entryCount > 0) {
      console.log(`  RSS items: ${itemCount}, Atom entries: ${entryCount}`);
    }
    
  } catch (e) {
    console.log(`${label} ERROR: ${e.message}`);
  }
}

async function main() {
  // === NEWS: Try actual current articles from accessible sites ===
  console.log('\n=== NEWS SCRAPER - Current Articles ===');
  
  // Try NPR current articles
  await testUrl('NPR-current1', 'https://www.npr.org/2025/01/15/nx-s1-5248756/federal-reserve-interest-rates');
  await testUrl('NPR-current2', 'https://www.npr.org/2025/01/14/nx-s1-5247890/inflation-report');
  await testUrl('NPR-current3', 'https://www.npr.org/2025/01/13/nx-s1-5246789/economy-update');
  
  // Try AP News current articles
  await testUrl('AP-current1', 'https://apnews.com/article/federal-reserve-interest-rates-economy');
  await testUrl('AP-current2', 'https://apnews.com/article/inflation-consumer-prices');
  await testUrl('AP-current3', 'https://apnews.com/article/stock-market-wall-street');
  
  // Try BBC current articles
  await testUrl('BBC-current1', 'https://www.bbc.com/news/articles/c93dzn9x4kzo');
  await testUrl('BBC-current2', 'https://www.bbc.com/news/business-12345678');
  
  // Try other accessible news sites
  await testUrl('TechCrunch1', 'https://techcrunch.com/2025/01/15/test-article/');
  await testUrl('Verge1', 'https://www.theverge.com/2025/1/15/test');
  await testUrl('ArsTechnica1', 'https://arstechnica.com/technology/2025/01/test/');
  await testUrl('Wired1', 'https://www.wired.com/story/test-article/');
  
  // Try Reuters alternative
  await testUrl('Reuters-alt1', 'https://www.reuters.com/business/test-2025-01-15/');
  await testUrl('Bloomberg1', 'https://www.bloomberg.com/news/articles/2025-01-15/test');
  
  // Try local news sites that are more scraper-friendly
  await testUrl('SeattleTimes1', 'https://www.seattletimes.com/business/test/');
  await testUrl('ChicagoTribune1', 'https://www.chicagotribune.com/business/test/');
  
  // === JOB: Try actual current job postings ===
  console.log('\n=== JOB SCRAPER - Current Postings ===');
  
  // Try Greenhouse with actual job IDs
  await testUrl('GH-job1', 'https://boards.greenhouse.io/stripe/jobs/6842801');
  await testUrl('GH-job2', 'https://boards.greenhouse.io/stripe/jobs/7111678002');
  await testUrl('GH-job3', 'https://boards.greenhouse.io/coinbase/jobs/6842801');
  await testUrl('GH-job4', 'https://boards.greenhouse.io/airbnb/jobs/6842801');
  
  // Try Lever with actual job IDs
  await testUrl('Lever-job1', 'https://jobs.lever.co/stripe/abc123');
  await testUrl('Lever-job2', 'https://jobs.lever.co/coinbase/abc123');
  
  // Try other ATS platforms
  await testUrl('Workday-job1', 'https://myworkdayjobs.com/en-US/stripe/job/Seattle/Software-Engineer_REQ123');
  
  // === PRESS RELEASE: Try more RSS feeds ===
  console.log('\n=== PRESS RELEASE - More RSS Feeds ===');
  
  // Try alternative wire services
  await testUrl('PR-Newswire-alt1', 'https://www.prnewswire.com/rss/');
  await testUrl('PR-Newswire-alt2', 'https://feeds.prnewswire.com/prnewswire/us/en/top-news');
  await testUrl('BusinessWire-alt1', 'https://feeds.businesswire.com/businesswire/en/top-news');
  await testUrl('GlobeNewswire-alt1', 'https://www.globenewswire.com/rss');
  
  // Try government RSS feeds as alternative
  await testUrl('SEC-EDGAR-Atom', 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=&dateb=&owner=include&count=10&search_text=&action=getcompany&output=atom');
  await testUrl('FTC-News', 'https://www.ftc.gov/feeds/press-release-consumer-protection.xml');
  await testUrl('DOJ-News', 'https://www.justice.gov/feeds/press_releases.xml');
  
  // Try tech company press pages
  await testUrl('Apple-Newsroom', 'https://www.apple.com/newsroom/rss-feed.rss');
  await testUrl('Google-Blog', 'https://blog.google/rss/');
  await testUrl('Microsoft-Blog', 'https://blogs.microsoft.com/feed/');
  
  // === TWITTER: Try more alternatives ===
  console.log('\n=== TWITTER - More Alternatives ===');
  
  await testUrl('fxtwitter-alt', 'https://api.fxtwitter.com/POTUS/status/1863271492663296448');
  await testUrl('vxtwitter-alt', 'https://api.vxtwitter.com/POTUS/status/1863271492663296448');
  await testUrl('twstalker', 'https://twstalker.com/POTUS/status/1863271492663296448');
  await testUrl('nitter-poast', 'https://nitter.poast.org/POTUS/status/1863271492663296448');
  await testUrl('nitter-priv', 'https://nitter.privacydev.net/POTUS/status/1863271492663296448');
}

main().catch(console.error);
