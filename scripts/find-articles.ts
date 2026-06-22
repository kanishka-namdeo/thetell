// Find real article URLs from news sites
async function main() {
  // Fetch NPR economy page and extract article links
  const r = await fetch('https://www.npr.org/sections/economy/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(15000),
  });
  const html = await r.text();
  
  // Find article URLs
  const urlMatches = html.match(/https:\/\/www\.npr\.org\/20\d{2}\/\d{2}\/\d{2}\/\d+\/[a-z0-9-]+/g);
  if (urlMatches) {
    const unique = [...new Set(urlMatches)].slice(0, 10);
    console.log('NPR article URLs:');
    unique.forEach(u => console.log(' ', u));
  }
  
  // Fetch AP News business page
  try {
    const r2 = await fetch('https://apnews.com/business', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15000),
    });
    const html2 = await r2.text();
    const urlMatches2 = html2.match(/https:\/\/apnews\.com\/article\/[a-z0-9-]+/g);
    if (urlMatches2) {
      const unique2 = [...new Set(urlMatches2)].slice(0, 10);
      console.log('\nAP article URLs:');
      unique2.forEach(u => console.log(' ', u));
    }
  } catch (e) {
    console.log('AP fetch failed:', (e as Error).message);
  }
  
  // Try BBC
  try {
    const r3 = await fetch('https://www.bbc.com/news/business', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15000),
    });
    const html3 = await r3.text();
    const urlMatches3 = html3.match(/https:\/\/www\.bbc\.com\/news\/articles\/[a-z0-9]+/g);
    if (urlMatches3) {
      const unique3 = [...new Set(urlMatches3)].slice(0, 10);
      console.log('\nBBC article URLs:');
      unique3.forEach(u => console.log(' ', u));
    }
  } catch (e) {
    console.log('BBC fetch failed:', (e as Error).message);
  }
}

main().catch(console.error);
