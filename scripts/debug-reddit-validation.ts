import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const testSubreddits = ["linkedin", "investing", "stocks", "technology"];

  console.log("=== Debugging Reddit Validation ===\n");

  for (const name of testSubreddits) {
    console.log(`\n--- Testing r/${name} ---`);
    
    // Test JSON API
    const aboutUrl = `https://www.reddit.com/r/${name}/about.json`;
    console.log(`Fetching: ${aboutUrl}`);
    
    try {
      const response = await fetch(aboutUrl, {
        headers: {
          "User-Agent": "TheTell-Bot/1.0 (+https://thetell.example.com/bot; contact@example.com)",
        },
        signal: AbortSignal.timeout(10_000),
      });

      console.log(`Status: ${response.status} ${response.statusText}`);
      console.log(`Content-Type: ${response.headers.get("content-type")}`);

      if (response.status === 200) {
        const data = await response.json();
        console.log(`Has data: ${!!data?.data}`);
        console.log(`Display name: ${data?.data?.display_name || "N/A"}`);
        console.log(`Subscribers: ${data?.data?.subscribers || "N/A"}`);
      } else {
        const text = await response.text();
        console.log(`Response (first 500 chars): ${text.substring(0, 500)}`);
      }
    } catch (error) {
      console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Test RSS feed
    const feedUrl = `https://www.reddit.com/r/${name}/.rss`;
    console.log(`\nFetching RSS: ${feedUrl}`);
    
    try {
      const response = await fetch(feedUrl, {
        headers: {
          "User-Agent": "TheTell-Bot/1.0 (+https://thetell.example.com/bot; contact@example.com)",
        },
        signal: AbortSignal.timeout(10_000),
      });

      console.log(`Status: ${response.status} ${response.statusText}`);
      console.log(`Content-Type: ${response.headers.get("content-type")}`);

      const text = await response.text();
      console.log(`Response length: ${text.length} chars`);
      console.log(`First 300 chars: ${text.substring(0, 300)}`);
      
      const hasRss = text.includes("<rss");
      const hasFeed = text.includes("<feed");
      console.log(`Has <rss>: ${hasRss}`);
      console.log(`Has <feed>: ${hasFeed}`);
      
      const subscriberMatch = text.match(/(\d+)\s*(?:readers|subscribers|members)/i);
      console.log(`Subscriber match: ${subscriberMatch ? subscriberMatch[1] : "none"}`);
    } catch (error) {
      console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Wait between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
