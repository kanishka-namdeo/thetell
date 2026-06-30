import { config } from "dotenv";
config({ path: ".env.local" });

async function testFeed(url: string): Promise<{ url: string; status: number | string; ok: boolean }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    return { url, status: response.status, ok: response.ok };
  } catch (error) {
    return { url, status: (error as Error).message, ok: false };
  }
}

async function main() {
  const feedsToTest = [
    // Apple
    { company: "Apple", url: "https://www.apple.com/newsroom/rss/feed.rss" },
    { company: "Apple", url: "https://www.apple.com/newsroom/feed/articles.rss" },
    { company: "Apple", url: "https://investor.apple.com/rss" },
    
    // Microsoft
    { company: "Microsoft", url: "https://news.microsoft.com/feed/" },
    { company: "Microsoft", url: "https://blogs.microsoft.com/feed/" },
    { company: "Microsoft", url: "https://devblogs.microsoft.com/feed/" },
    { company: "Microsoft", url: "https://www.microsoft.com/en-us/investor/rss/rss.xml" },
    
    // NVIDIA
    { company: "NVIDIA", url: "https://nvidianews.nvidia.com/releases.xml" },
    { company: "NVIDIA", url: "https://blogs.nvidia.com/feed/" },
    { company: "NVIDIA", url: "https://investor.nvidia.com/rss.xml" },
    
    // Tesla
    { company: "Tesla", url: "https://www.tesla.com/blog/feed" },
    { company: "Tesla", url: "https://ir.tesla.com/rss.xml" },
    
    // AMD
    { company: "AMD", url: "https://ir.amd.com/news-events/press-releases/rss" },
  ];

  console.log("Testing RSS feeds...\n");
  
  const results: Record<string, { working: string[]; broken: string[] }> = {};
  
  for (const feed of feedsToTest) {
    const result = await testFeed(feed.url);
    
    if (!results[feed.company]) {
      results[feed.company] = { working: [], broken: [] };
    }
    
    if (result.ok) {
      console.log(`✓ ${feed.company}: ${feed.url}`);
      results[feed.company].working.push(feed.url);
    } else {
      console.log(`✗ ${feed.company}: ${feed.url} - ${result.status}`);
      results[feed.company].broken.push(feed.url);
    }
  }
  
  console.log("\n=== Summary ===");
  for (const [company, data] of Object.entries(results)) {
    console.log(`${company}: ${data.working.length} working, ${data.broken.length} broken`);
  }
}

main().catch(console.error);
