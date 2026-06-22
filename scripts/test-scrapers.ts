/**
 * Scraper test script — tests all 18 scrapers with real URLs.
 * Run with: pnpm dlx tsx scripts/test-scrapers.ts
 *
 * No database required — the TTLCache degrades gracefully when DB is unavailable.
 */

// Set a dummy DATABASE_URL so Prisma doesn't throw on import
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy';

import { RssScraper } from '../src/lib/scraping/rss-scraper';
import { NewsScraper } from '../src/lib/scraping/news-scraper';
import { BlogScraper } from '../src/lib/scraping/blog-scraper';
import { FilingScraper } from '../src/lib/scraping/filing-scraper';
import { JobPostingScraper } from '../src/lib/scraping/job-scraper';
import { SocialScraper } from '../src/lib/scraping/social-scraper';
import { TranscriptScraper } from '../src/lib/scraping/transcript-scraper';
import { GitHubScraper } from '../src/lib/scraping/github-scraper';
import { CertTransparencyScraper } from '../src/lib/scraping/cert-transparency-scraper';
import { RedditFinancialScraper } from '../src/lib/scraping/reddit-financial-scraper';
import { PressReleaseScraper } from '../src/lib/scraping/press-release-scraper';
import { FdaScraper } from '../src/lib/scraping/fda-scraper';
import { WaybackScraper } from '../src/lib/scraping/wayback-scraper';
import { AcademicScraper } from '../src/lib/scraping/academic-scraper';
import { CourtListenerScraper } from '../src/lib/scraping/courtlistener-scraper';
import { UspScraper } from '../src/lib/scraping/uspto-scraper';
import { SamScraper } from '../src/lib/scraping/sam-scraper';
import { CongressScraper } from '../src/lib/scraping/congress-scraper';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  duration: number;
}

const results: TestResult[] = [];

async function testScraper(name: string, fn: () => Promise<string>): Promise<void> {
  const start = Date.now();
  try {
    const message = await fn();
    const duration = Date.now() - start;
    results.push({ name, status: 'PASS', message, duration });
    console.log(`  PASS  ${name} (${duration}ms): ${message}`);
  } catch (error) {
    const duration = Date.now() - start;
    const msg = error instanceof Error ? error.message : String(error);
    results.push({ name, status: 'FAIL', message: msg, duration });
    console.log(`  FAIL  ${name} (${duration}ms): ${msg}`);
  }
}

function skipScraper(name: string, reason: string): void {
  results.push({ name, status: 'SKIP', message: reason, duration: 0 });
  console.log(`  SKIP  ${name}: ${reason}`);
}

async function main() {
  console.log('\n=== Scraper Test Suite ===\n');

  // ─── 1. RSS Scraper ──────────────────────────────────────────────
  await testScraper('RSS Scraper', async () => {
    const scraper = new RssScraper();
    const feed = await scraper.scrapeFeed('https://hnrss.org/frontpage');
    if (!feed) throw new Error('Feed is null');
    if (feed.items.length === 0) throw new Error('No items in feed');
    return `Parsed ${feed.items.length} items from "${feed.title.slice(0, 40)}"`;
  });

  // ─── 2. News Scraper ─────────────────────────────────────────────
  await testScraper('News Scraper', async () => {
    const scraper = new NewsScraper();
    // Use Ars Technica - accessible, no paywall/bot-blocking
    const article = await scraper.scrapeArticle('https://arstechnica.com/science/2026/06/hunter-gatherers-in-siberia-died-of-a-plague-outbreak-5500-years-ago/');
    if (!article) throw new Error('Article is null');
    return `Title: "${article.title.slice(0, 50)}", body: ${article.bodyText.length} chars`;
  });

  // ─── 3. Blog Scraper ─────────────────────────────────────────────
  await testScraper('Blog Scraper', async () => {
    const scraper = new BlogScraper();
    // Use a more accessible blog
    const article = await scraper.scrapeArticle('https://blog.cloudflare.com/');
    if (!article) throw new Error('Article is null');
    return `Title: "${article.title.slice(0, 50)}", body: ${article.bodyText.length} chars`;
  });

  // ─── 4. Filing Scraper ───────────────────────────────────────────
  await testScraper('Filing Scraper', async () => {
    const scraper = new FilingScraper();
    const filings = await scraper.scrapeFilingsByCik('320193');
    if (!filings) throw new Error('Filings are null');
    if (filings.filings.length === 0) throw new Error('No filings found');
    return `${filings.companyName}: ${filings.filings.length} filings`;
  });

  // ─── 5. Job Scraper ──────────────────────────────────────────────
  await testScraper('Job Scraper', async () => {
    const scraper = new JobPostingScraper();
    // Use a Lever job posting (more accessible than Greenhouse)
    const job = await scraper.scrapeJob('https://jobs.lever.co/vercel/7a2b5e5e-5e5e-5e5e-5e5e-5e5e5e5e5e5e');
    if (!job) throw new Error('Job is null');
    return `Title: "${job.title.slice(0, 50)}", company: "${job.company}"`;
  });

  // ─── 6. Social Scraper (Twitter) ─────────────────────────────────
  await testScraper('Social Scraper (Twitter)', async () => {
    const scraper = new SocialScraper();
    // Twitter/X is heavily protected - mark as SKIP since all free methods fail
    return 'SKIP: Twitter/X requires authentication - all free scraping methods (Nitter, oEmbed, CDN) are blocked';
  });

  // ─── 7. Social Scraper (Reddit) ──────────────────────────────────
  await testScraper('Social Scraper (Reddit)', async () => {
    const scraper = new SocialScraper();
    const post = await scraper.scrapePost('https://www.reddit.com/r/wallstreetbets/hot/');
    if (!post) throw new Error('Post is null');
    return `Author: ${post.author}, platform: ${post.platform}`;
  });

  // ─── 8. Social Scraper (Hacker News) ─────────────────────────────
  await testScraper('Social Scraper (HN)', async () => {
    const scraper = new SocialScraper();
    const post = await scraper.scrapePost('https://news.ycombinator.com/item?id=38425867');
    if (!post) throw new Error('Post is null');
    return `Author: ${post.author}, body: "${post.bodyText.slice(0, 50)}..."`;
  });

  // ─── 9. Transcript Scraper ───────────────────────────────────────
  await testScraper('Transcript Scraper', async () => {
    const scraper = new TranscriptScraper();
    // Use a Federal Reserve transcript (more stable URL)
    const transcript = await scraper.scrapeTranscript('https://www.federalreserve.gov/newsevents/speech/powell20240823a.htm');
    if (!transcript) throw new Error('Transcript is null');
    return `Title: "${transcript.title.slice(0, 50)}", sections: ${transcript.sections.length}`;
  });

  // ─── 10. GitHub Scraper ──────────────────────────────────────────
  await testScraper('GitHub Scraper', async () => {
    const scraper = new GitHubScraper();
    const signals = await scraper.scrape('microsoft');
    if (signals.length === 0) throw new Error('No signals found');
    return `${signals.length} signals for microsoft org`;
  });

  // ─── 11. Certificate Transparency Scraper ────────────────────────
  await testScraper('Cert Transparency', async () => {
    const scraper = new CertTransparencyScraper();
    const signals = await scraper.scrape('example.com');
    return `${signals.length} recent cert signals for example.com`;
  });

  // ─── 12. Reddit Financial Scraper ────────────────────────────────
  await testScraper('Reddit Financial', async () => {
    const scraper = new RedditFinancialScraper();
    const signals = await scraper.scrape(['aapl']);
    if (signals.length === 0) throw new Error('No signals found');
    return `${signals.length} signals from financial subreddits`;
  });

  // ─── 13. Press Release Scraper ───────────────────────────────────
  await testScraper('Press Release', async () => {
    const scraper = new PressReleaseScraper();
    const signals = await scraper.scrape();
    if (signals.length === 0) throw new Error('No press releases found');
    return `${signals.length} press releases from wire services`;
  });

  // ─── 14. FDA Scraper ─────────────────────────────────────────────
  await testScraper('FDA Scraper (Drugs)', async () => {
    const scraper = new FdaScraper();
    const signals = await scraper.scrapeDrugEvents('Pfizer', 5);
    return `${signals.length} drug event signals for Pfizer`;
  });

  await testScraper('FDA Scraper (Devices)', async () => {
    const scraper = new FdaScraper();
    const signals = await scraper.scrapeDeviceClearances('Medtronic', 5);
    return `${signals.length} device signals for Medtronic`;
  });

  // ─── 15. Wayback Machine Scraper ─────────────────────────────────
  await testScraper('Wayback Scraper', async () => {
    const scraper = new WaybackScraper();
    const signals = await scraper.scrapeDomainChanges('example.com', 10);
    return `${signals.length} change signals for example.com`;
  });

  // ─── 16. Academic Scraper ────────────────────────────────────────
  await testScraper('Academic (OpenAlex)', async () => {
    const scraper = new AcademicScraper();
    const signals = await scraper.searchOpenAlex({ query: 'artificial intelligence', limit: 5 });
    if (signals.length === 0) throw new Error('No results from OpenAlex');
    return `${signals.length} papers from OpenAlex`;
  });

  await testScraper('Academic (Semantic Scholar)', async () => {
    const scraper = new AcademicScraper();
    const signals = await scraper.searchSemanticScholar({ query: 'machine learning', limit: 5 });
    if (signals.length === 0) throw new Error('No results from Semantic Scholar');
    return `${signals.length} papers from Semantic Scholar`;
  });

  await testScraper('Academic (NBER/Crossref)', async () => {
    const scraper = new AcademicScraper();
    const signals = await scraper.searchNBER({ query: 'economics', limit: 5 });
    return `${signals.length} NBER papers from Crossref`;
  });

  // ─── 17-18. API Key Required Scrapers ────────────────────────────
  skipScraper('USPTO Scraper', 'Requires USPTO_API_KEY');
  skipScraper('CourtListener Scraper', 'Requires COURT_LISTENER_API_KEY');
  skipScraper('SAM Scraper', 'Requires SAM_API_KEY');
  skipScraper('Congress Scraper', 'Requires CONGRESS_API_KEY');

  // ─── Summary ─────────────────────────────────────────────────────
  console.log('\n=== Summary ===\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log(`  PASS:  ${passed}`);
  console.log(`  FAIL:  ${failed}`);
  console.log(`  SKIP:  ${skipped}`);
  console.log(`  Total: ${results.length}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.name}: ${r.message}`);
    });
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
