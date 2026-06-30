// Quick diagnostic: check what Reddit returns for subreddit RSS feeds
const subreddits = [
  "investing", "stocks", "wallstreet", "technology", "startups",
  "jobsearch", "careers", "socialmedia", "entrepreneur", "microsoft",
  "indeed", "glassdoor", "x", "business", "linkedin"
];

const USER_AGENT = "TheTell-Bot/1.0 (+https://thetell.example.com/bot; contact@example.com)";

async function checkSubreddit(name: string) {
  const url = `https://www.reddit.com/r/${name}/.rss`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    const subscriberMatch = text.match(/(\d+)\s*(?:readers|subscribers|members)/i);
    console.log(`r/${name}: status=${res.status}, size=${text.length}, subscribers=${subscriberMatch?.[1] ?? "not found"}`);
    if (res.status !== 200) {
      console.log(`  Response preview: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.log(`r/${name}: ERROR - ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  for (const sub of subreddits) {
    await checkSubreddit(sub);
    await new Promise(r => setTimeout(r, 1100));
  }
}

main();
