import { parseFeed } from 'feedsmith';

async function testFeedsmith() {
  // Fetch CNBC feed directly
  const res = await fetch('https://www.cnbc.com/id/10001147/device/rss/rss.html');
  const xml = await res.text();
  
  // Show a snippet of the raw XML around content:encoded
  const contentIdx = xml.indexOf('content:encoded');
  if (contentIdx > -1) {
    console.log('=== Raw XML around content:encoded ===');
    console.log(xml.substring(contentIdx - 50, contentIdx + 300));
  } else {
    console.log('No content:encoded found in CNBC feed');
  }

  // Parse with feedsmith
  const result = parseFeed(xml);
  console.log('\n=== Feedsmith parse result ===');
  console.log('Format:', result.format);
  
  if (result.format === 'rss' && result.feed.items && result.feed.items.length > 0) {
    const item = result.feed.items[0] as Record<string, unknown>;
    console.log('\nFirst item keys:', Object.keys(item));
    console.log('\nFull item structure:');
    console.log(JSON.stringify(item, null, 2).substring(0, 3000));
  }

  // Also try a feed known to have content:encoded
  console.log('\n\n=== Testing feed with content:encoded ===');
  const res2 = await fetch('https://feeds.arstechnica.com/arstechnica/index');
  const xml2 = await res2.text();
  
  const contentIdx2 = xml2.indexOf('content:encoded');
  if (contentIdx2 > -1) {
    console.log('Raw XML around content:encoded:');
    console.log(xml2.substring(contentIdx2 - 50, contentIdx2 + 500));
  }
  
  const result2 = parseFeed(xml2);
  if (result2.format === 'rss' && result2.feed.items && result2.feed.items.length > 0) {
    const item2 = result2.feed.items[0] as Record<string, unknown>;
    console.log('\nArs Technica item keys:', Object.keys(item2));
    console.log('\nFull item:');
    console.log(JSON.stringify(item2, null, 2).substring(0, 3000));
  }
}

testFeedsmith().catch(console.error);
