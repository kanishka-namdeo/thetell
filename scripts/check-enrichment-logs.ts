import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { prisma } = await import("../src/lib/db");

  console.log("=== Enrichment Logs for Tesla and AMD ===\n");

  const tesla = await prisma.company.findFirst({
    where: { name: { contains: "Tesla", mode: "insensitive" } },
    include: {
      enrichmentLogs: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  const amd = await prisma.company.findFirst({
    where: { name: { contains: "AMD", mode: "insensitive" } },
    include: {
      enrichmentLogs: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  console.log("Tesla, Inc.:");
  console.log("  Ticker:", tesla?.ticker);
  console.log("  Website:", tesla?.websiteUrl);
  console.log("  Enrichment logs:", tesla?.enrichmentLogs.length);
  tesla?.enrichmentLogs.forEach((log, i) => {
    console.log(`  Log ${i + 1}:`);
    console.log(`    Status: ${log.status}`);
    console.log(`    Feeds discovered: ${log.feedsDiscovered}`);
    console.log(`    Feeds validated: ${log.feedsValidated}`);
    console.log(`    Blogs discovered: ${log.blogsDiscovered}`);
    console.log(`    Ticker found: ${log.tickerFound}`);
    console.log(`    Error: ${log.error || "none"}`);
    console.log(`    Created: ${log.createdAt.toISOString()}`);
  });

  console.log("\nAdvanced Micro Devices, Inc.:");
  console.log("  Ticker:", amd?.ticker);
  console.log("  Website:", amd?.websiteUrl);
  console.log("  Enrichment logs:", amd?.enrichmentLogs.length);
  amd?.enrichmentLogs.forEach((log, i) => {
    console.log(`  Log ${i + 1}:`);
    console.log(`    Status: ${log.status}`);
    console.log(`    Feeds discovered: ${log.feedsDiscovered}`);
    console.log(`    Feeds validated: ${log.feedsValidated}`);
    console.log(`    Blogs discovered: ${log.blogsDiscovered}`);
    console.log(`    Ticker found: ${log.tickerFound}`);
    console.log(`    Error: ${log.error || "none"}`);
    console.log(`    Created: ${log.createdAt.toISOString()}`);
  });

  console.log("\n=== Signal Sources for Tesla and AMD ===\n");

  const teslaSignals = await prisma.signal.findMany({
    where: { companyId: tesla?.id },
    select: { sourceType: true, sourceUrl: true },
    take: 10,
  });

  console.log("Tesla signals:");
  teslaSignals.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.sourceType}: ${s.sourceUrl.substring(0, 80)}`);
  });

  const amdSignals = await prisma.signal.findMany({
    where: { companyId: amd?.id },
    select: { sourceType: true, sourceUrl: true },
    take: 10,
  });

  console.log("\nAMD signals:");
  amdSignals.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.sourceType}: ${s.sourceUrl.substring(0, 80)}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
