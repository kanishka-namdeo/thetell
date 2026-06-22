import { config } from "dotenv";
config();

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";

const connectionString = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.log("No company found");
    return;
  }

  const signals = [
    {
      sourceUrl: "https://reddit.com/r/wallstreetbets/abc123",
      sourceType: "SOCIAL" as const,
      title: "NVDA earnings beat expectations - DD inside",
      rawContent:
        "NVDA just reported Q4 earnings and crushed estimates. Data center revenue up 400% YoY. Blackwell chips are selling out. Price target raised to $180. This is just the beginning of the AI revolution.",
      publishedAt: new Date("2026-06-18"),
      companyId: company.id,
      status: "PENDING" as const,
      engagement: { score: 15420, upvoteRatio: 0.97, comments: 892 },
      author: "u/deepvalue_analyst",
      metadata: { subreddit: "wallstreetbets", flair: "DD", awards: 12 },
    },
    {
      sourceUrl: "https://reddit.com/r/stocks/def456",
      sourceType: "SOCIAL" as const,
      title: "AAPL supply chain issues affecting Vision Pro 2 production",
      rawContent:
        "Multiple sources in Asia reporting Apple Vision Pro 2 production delays. Samsung display yield issues causing bottleneck. Q1 2027 launch now in question.",
      publishedAt: new Date("2026-06-17"),
      companyId: company.id,
      status: "PENDING" as const,
      engagement: { score: 3847, upvoteRatio: 0.89, comments: 234 },
      author: "u/supplychain_watcher",
      metadata: { subreddit: "stocks", flair: "Macro", awards: 3 },
    },
    {
      sourceUrl: "https://reddit.com/r/investing/ghi789",
      sourceType: "SOCIAL" as const,
      title: "TSLA robotaxi launch timeline - realistic analysis",
      rawContent:
        "After reviewing Tesla Q4 call transcripts and regulatory filings, I believe robotaxi launch will be delayed to 2027. The technology is there but regulatory approval in California will be the bottleneck.",
      publishedAt: new Date("2026-06-16"),
      companyId: company.id,
      status: "PENDING" as const,
      engagement: { score: 892, upvoteRatio: 0.76, comments: 156 },
      author: "u/autonomous_investor",
      metadata: { subreddit: "investing", flair: "Analysis", awards: 1 },
    },
  ];

  let count = 0;
  for (const s of signals) {
    try {
      await prisma.signal.create({ data: s });
      count++;
      console.log("Created:", s.title);
    } catch (e) {
      console.log("Skip (dup?):", s.sourceUrl);
    }
  }
  console.log(`Seeded ${count} Reddit signals with engagement data`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
