import { parseFeed } from 'feedsmith';

async function testTechCrunch() {
  console.log('=== Testing TechCrunch feed ===');
  const res = await fetch('https://techcrunch.com/feed/');
  const xml = await res.text();
  
  // Check if content:encoded exists in raw XML
  const hasContentEncoded = xml.includes('content:encoded');
  console.log('Has content:encoded in XML:', hasContentEncoded);
  
  // Parse with feedsmith
  const result = parseFeed(xml);
  console.log('Format:', result.format);
  
  if (result.format === 'rss' && result.feed.items && result.feed.items.length > 0) {
    const item = result.feed.items[0] as Record<string, unknown>;
    console.log('\nFirst item keys:', Object.keys(item));
    console.log('\nItem structure:');
    console.log(JSON.stringify(item, null, 2));
    
    // Check if content exists
    if (item.content) {
      console.log('\n✅ content field exists');
      console.log('content.encoded:', (item.content as any).encoded?.substring(0, 200));
    } else {
      console.log('\n❌ No content field - only description available');
    }
  }
}

testTechCrunch().catch(console.error);
