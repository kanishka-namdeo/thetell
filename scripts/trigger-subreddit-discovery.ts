import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { prisma } = await import("../src/lib/db");
  const { discoverSubredditsForCompany } = await import("../src/lib/reddit/subreddit-discovery");

  console.log("=== Finding Companies ===");
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      ticker: true,
      industry: true,
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (companies.length === 0) {
    console.log("No companies found in database");
    return;
  }

  console.log("\nAvailable companies:");
  companies.forEach((c, i) => {
    console.log(`${i + 1}. ${c.name} (${c.slug}) - ${c.ticker || "No ticker"} - ${c.industry || "No industry"}`);
  });

  // Pick the first company for testing
  const testCompany = companies[0];
  console.log(`\n=== Testing Subreddit Discovery for: ${testCompany.name} ===`);
  console.log(`Company ID: ${testCompany.id}`);

  // Check existing discovery logs
  const existingLogs = await prisma.subredditDiscoveryLog.findMany({
    where: { companyId: testCompany.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  console.log(`\nExisting discovery logs: ${existingLogs.length}`);
  existingLogs.forEach((log) => {
    console.log(`  - ${log.status}: ${log.suggestedCount} suggested, ${log.validatedCount} validated (${log.createdAt.toISOString()})`);
  });

  // Check existing tracked subreddits
  const existingSubreddits = await prisma.trackedSubreddit.findMany({
    where: { companyId: testCompany.id },
  });

  console.log(`\nExisting tracked subreddits: ${existingSubreddits.length}`);
  existingSubreddits.forEach((sub) => {
    console.log(`  - r/${sub.subreddit}: ${sub.subscriberCount || "unknown"} subscribers, active: ${sub.isActive}`);
  });

  // Trigger discovery
  console.log("\n=== Triggering Subreddit Discovery ===");
  const startTime = Date.now();
  
  try {
    const result = await discoverSubredditsForCompany(testCompany.id);
    const duration = Date.now() - startTime;

    console.log(`\n=== Discovery Complete (${duration}ms) ===`);
    console.log(`Status: ${result.status}`);
    console.log(`Suggested: ${result.suggestedCount}`);
    console.log(`Validated: ${result.validatedCount}`);
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }

    // Check new tracked subreddits
    const newSubreddits = await prisma.trackedSubreddit.findMany({
      where: { companyId: testCompany.id },
      orderBy: { createdAt: "desc" },
    });

    console.log(`\n=== Updated Tracked Subreddits (${newSubreddits.length} total) ===`);
    newSubreddits.forEach((sub) => {
      console.log(`  - r/${sub.subreddit}: ${sub.subscriberCount || "unknown"} subscribers, active: ${sub.isActive}`);
    });

    // Check new discovery log
    const newLog = await prisma.subredditDiscoveryLog.findFirst({
      where: { companyId: testCompany.id },
      orderBy: { createdAt: "desc" },
    });

    if (newLog) {
      console.log(`\n=== Latest Discovery Log ===`);
      console.log(`Status: ${newLog.status}`);
      console.log(`Suggested: ${newLog.suggestedCount}`);
      console.log(`Validated: ${newLog.validatedCount}`);
      console.log(`Duration: ${newLog.durationMs}ms`);
      if (newLog.error) {
        console.log(`Error: ${newLog.error}`);
      }
      console.log(`Created: ${newLog.createdAt.toISOString()}`);
    }

  } catch (error) {
    console.error("\n=== Discovery Failed ===");
    console.error(error);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
