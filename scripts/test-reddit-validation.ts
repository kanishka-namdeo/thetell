import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { validateSubreddit } = await import("../src/lib/reddit/subreddit-discovery");

  const testSubreddits = [
    "linkedin",
    "investing",
    "stocks",
    "technology",
    "wallstreetbets",
    "finance",
    "business",
    "nonexistent_subreddit_12345",
  ];

  console.log("=== Testing Reddit Validation ===\n");

  for (const name of testSubreddits) {
    console.log(`Testing r/${name}...`);
    const result = await validateSubreddit(name);
    console.log(`  Valid: ${result.valid}`);
    console.log(`  Subscribers: ${result.subscriberCount || "unknown"}`);
    console.log();
    
    // Wait between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
