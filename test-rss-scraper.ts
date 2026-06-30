import { RssScraper } from './src/lib/scraping/rss-scraper';
import { getAllFeeds } from './src/lib/scraping/feed-registry';

const TEST_FEEDS = [
  { name: 'Microsoft News', url: 'https://news.microsoft.com/feed/' },
  { name: 'Google Blog', url: 'https://blog.google/rss/' },
  { name: 'NVIDIA Blog', url: 'https://blogs.nvidia.com/feed/' },
  { name: 'Tesla IR', url: 'https://ir.tesla.com/rss.xml' },
  { name: 'Reddit r/wallstreetbets', url: 'https://www.reddit.com/r/wallstreetbets/.rss' },
];

async function testFeed(scraper: RssScraper, name: string, url: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(60));

  try {
    const startTime = Date.now();
    const result = await scraper.scrapeFeed(url);
    const duration = Date.now() - startTime;

    if (!result) {
      console.log('❌ FAILED: Feed returned null');
      return { name, url, success: false, error: 'Feed returned null' };
    }

    console.log(`✅ SUCCESS`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Feed Title: ${result.title}`);
    console.log(`   Items Parsed: ${result.items.length}`);

    if (result.items.length > 0) {
      console.log(`   First 3 Items:`);
      result.items.slice(0, 3).forEach((item, idx) => {
        console.log(`     ${idx + 1}. ${item.title}`);
        if (item.pubDate) {
          console.log(`        Date: ${item.pubDate.toISOString()}`);
        }
      });
    } else {
      console.log(`   ⚠️  No items parsed`);
    }

    return {
      name,
      url,
      success: true,
      itemCount: result.items.length,
      duration,
    };
  } catch (error) {
    console.log(`❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return {
      name,
      url,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log('\n🔍 RSS Scraper Test Suite');
  console.log(`Testing ${TEST_FEEDS.length} feeds from registry\n`);

  // Show registry info
  const allFeeds = getAllFeeds();
  console.log(`Registry contains ${allFeeds.length} companies`);
  const totalFeeds = allFeeds.reduce((sum, company) => sum + company.feeds.length, 0);
  console.log(`Total feeds in registry: ${totalFeeds}\n`);

  const scraper = new RssScraper();
  const results = [];

  for (const feed of TEST_FEEDS) {
    const result = await testFeed(scraper, feed.name, feed.url);
    results.push(result);
    // Small delay between requests to be polite
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log(`\n\n${'='.repeat(60)}`);
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Successful: ${successful.length}/${results.length}`);
  successful.forEach(r => {
    console.log(`   • ${r.name}: ${r.itemCount} items (${r.duration}ms)`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}/${results.length}`);
    failed.forEach(r => {
      console.log(`   • ${r.name}: ${r.error}`);
    });
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
