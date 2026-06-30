/**
 * Pipeline test script - scrapes signals and runs dual-agent analysis
 * Tests the hybrid agent routing with sourceMatchPreference boost
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";
import { RssScraper } from "../src/lib/scraping/rss-scraper";
import { GitHubScraper } from "../src/lib/scraping/github-scraper";
import { analyzeSignalWithAgent } from "../src/lib/ai/agent/pipeline";
import type { AgentAnalysisInput } from "../src/lib/ai/agent/pipeline";
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from "../src/lib/ai/agent/personas";
import { getAllFeeds } from "../src/lib/scraping/feed-registry";
import type { SourceType } from "@prisma/client";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface ScrapedSignal {
  title: string;
  url: string;
  content: string;
  sourceType: SourceType;
  companyName: string;
  companyId: string;
  metadata?: Record<string, unknown>;
}

async function main() {
  console.log("=== PIPELINE TEST: Hybrid Agent Routing ===\n");

  const companies = await prisma.company.findMany();
  console.log(`Found ${companies.length} companies:`);
  for (const c of companies) {
    console.log(`  - ${c.name} (${c.id.slice(0, 8)}...)`);
  }

  const scrapedSignals: ScrapedSignal[] = [];

  // Step 1: Scrape RSS feeds
  console.log("\n--- Step 1: Scraping RSS feeds ---");
  const rssScraper = new RssScraper();
  const feeds = getAllFeeds();
  let rssCount = 0;
  for (const companyFeed of feeds) {
    const company = companies.find((c) => c.id === companyFeed.companyId || c.slug === companyFeed.companyId);
    if (!company) continue;
    for (const feed of companyFeed.feeds) {
      if (feed.sourceType && feed.sourceType !== "NEWS" && feed.sourceType !== "BLOG") continue;
      try {
        const result = await rssScraper.scrapeFeed(feed.url);
        if (result && result.items.length > 0) {
          for (const item of result.items.slice(0, 2)) {
            scrapedSignals.push({
              title: item.title || "Untitled RSS Item",
              url: item.link || feed.url,
              content: (item.description || item.title || "No content available").slice(0, 500),
              sourceType: "RSS" as SourceType,
              companyName: company.name,
              companyId: company.id,
              metadata: { feedUrl: feed.url, feedTitle: result.title },
            });
            rssCount++;
          }
        }
      } catch (e) {
        console.log(`  RSS error for ${feed.url}: ${(e as Error).message.slice(0, 60)}`);
      }
    }
    if (rssCount >= 4) break;
  }
  console.log(`  Scraped ${rssCount} RSS signals`);

  // Step 2: Scrape GitHub
  console.log("\n--- Step 2: Scraping GitHub ---");
  const githubScraper = new GitHubScraper();
  let ghCount = 0;
  const ghTargets = ["microsoft", "google", "apple"];
  for (const org of ghTargets) {
    const company = companies.find((c) => c.name.toLowerCase().includes(org));
    if (!company) continue;
    try {
      const signals = await githubScraper.scrape(org);
      for (const sig of signals.slice(0, 2)) {
        scrapedSignals.push({
          title: sig.title,
          url: sig.url,
          content: (sig.description || sig.title).slice(0, 500),
          sourceType: "GITHUB" as SourceType,
          companyName: company.name,
          companyId: company.id,
          metadata: sig.metadata as Record<string, unknown>,
        });
        ghCount++;
      }
    } catch (e) {
      console.log(`  GitHub error for ${org}: ${(e as Error).message.slice(0, 60)}`);
    }
    if (ghCount >= 4) break;
  }
  console.log(`  Scraped ${ghCount} GitHub signals`);

  // Step 3: Scrape more RSS from different feeds to get variety
  console.log("\n--- Step 3: Scraping additional RSS for variety ---");
  const extraFeeds = [
    { url: "https://hnrss.org/frontpage", company: companies[0] },
    { url: "https://feeds.arstechnica.com/arstechnica/index", company: companies[1] || companies[0] },
  ];
  let extraCount = 0;
  for (const { url, company } of extraFeeds) {
    try {
      const result = await rssScraper.scrapeFeed(url);
      if (result && result.items.length > 0) {
        for (const item of result.items.slice(0, 2)) {
          scrapedSignals.push({
            title: item.title || "Untitled",
            url: item.link || url,
            content: (item.description || item.title || "No content").slice(0, 500),
            sourceType: "NEWS" as SourceType,
            companyName: company.name,
            companyId: company.id,
          });
          extraCount++;
        }
      }
    } catch (e) {
      console.log(`  Extra RSS error for ${url}: ${(e as Error).message.slice(0, 60)}`);
    }
  }
  console.log(`  Scraped ${extraCount} additional signals`);

  console.log(`\n=== Total scraped: ${scrapedSignals.length} signals ===\n`);

  if (scrapedSignals.length === 0) {
    console.log("No signals scraped. Cannot proceed with analysis.");
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  // Step 4: Store signals and run dual-agent analysis
  console.log("--- Step 4: Storing signals and running dual-agent analysis ---");
  let storedCount = 0;
  let analystAnalyzed = 0;
  let gossipAnalyzed = 0;
  const results: Array<{
    signalId: string;
    title: string;
    sourceType: SourceType;
    analystConfidence?: number;
    gossipConfidence?: number;
    analystSourceMatch?: boolean;
    gossipSourceMatch?: boolean;
  }> = [];

  for (const sig of scrapedSignals.slice(0, 6)) {
    try {
      const signal = await prisma.signal.create({
        data: {
          title: sig.title,
          sourceUrl: sig.url,
          sourceType: sig.sourceType,
          rawContent: sig.content,
          companyId: sig.companyId,
          status: "ANALYZED",
          dataOrigin: "SCRAPED",
          metadata: (sig.metadata || {}) as Record<string, string | number | boolean>,
        },
      });
      storedCount++;
      console.log(`\n  Signal ${storedCount}: "${sig.title.slice(0, 60)}" [${sig.sourceType}]`);

      // Build full AgentAnalysisInput
      const agentInput: AgentAnalysisInput = {
        id: signal.id,
        sourceUrl: signal.sourceUrl,
        sourceType: signal.sourceType as any,
        title: signal.title,
        rawContent: signal.rawContent || "",
        publishedAt: null,
        scrapedAt: signal.scrapedAt,
        companyId: signal.companyId,
        status: signal.status,
        engagement: null,
        metadata: signal.metadata as any,
        company: {
          id: sig.companyId,
          name: sig.companyName,
          slug: sig.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          ticker: null,
        },
      };

      // Analyst analysis
      let analystConfidence: number | undefined;
      let analystSourceMatch: boolean | null | undefined;
      try {
        const analystResult = await analyzeSignalWithAgent(agentInput, ANALYST_CONFIG);
        analystConfidence = analystResult.confidence;
        analystSourceMatch = analystResult.sourceMatchPreference;

        await prisma.analysis.create({
          data: {
            signalId: signal.id,
            agentPersona: "ANALYST",
            summary: analystResult.summary,
            keyFacts: analystResult.keyFacts as any,
            sentiment: (analystResult.sentiment as any)?.sentiment || "NEUTRAL",
            strategicThemes: analystResult.strategicThemes as any,
            confidence: analystResult.confidence,
            modelUsed: analystResult.modelUsed,
            sourceMatchPreference: analystResult.sourceMatchPreference ?? null,
          },
        });
        analystAnalyzed++;
      } catch (e) {
        console.log(`    Analyst error: ${(e as Error).message.slice(0, 100)}`);
      }

      // Gossip Girl analysis
      let gossipConfidence: number | undefined;
      let gossipSourceMatch: boolean | null | undefined;
      try {
        const gossipResult = await analyzeSignalWithAgent(agentInput, GOSSIP_GIRL_CONFIG);
        gossipConfidence = gossipResult.confidence;
        gossipSourceMatch = gossipResult.sourceMatchPreference;

        await prisma.analysis.create({
          data: {
            signalId: signal.id,
            agentPersona: "GOSSIP_GIRL",
            summary: gossipResult.summary,
            keyFacts: gossipResult.keyFacts as any,
            sentiment: (gossipResult.sentiment as any)?.sentiment || "NEUTRAL",
            strategicThemes: gossipResult.strategicThemes as any,
            confidence: gossipResult.confidence,
            modelUsed: gossipResult.modelUsed,
            sourceMatchPreference: gossipResult.sourceMatchPreference ?? null,
          },
        });
        gossipAnalyzed++;
      } catch (e) {
        console.log(`    Gossip Girl error: ${(e as Error).message.slice(0, 100)}`);
      }

      results.push({
        signalId: signal.id,
        title: sig.title,
        sourceType: sig.sourceType,
        analystConfidence,
        gossipConfidence,
        analystSourceMatch: analystSourceMatch ?? undefined,
        gossipSourceMatch: gossipSourceMatch ?? undefined,
      });

      console.log(`    Analyst: confidence=${analystConfidence?.toFixed(3)}, sourceMatch=${analystSourceMatch}`);
      console.log(`    Gossip:  confidence=${gossipConfidence?.toFixed(3)}, sourceMatch=${gossipSourceMatch}`);
    } catch (e) {
      console.log(`  Store error: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  // Summary
  console.log("\n=== PIPELINE TEST RESULTS ===");
  console.log(`Signals stored: ${storedCount}`);
  console.log(`Analyst analyses: ${analystAnalyzed}`);
  console.log(`Gossip Girl analyses: ${gossipAnalyzed}`);

  const bySource: Record<string, number> = {};
  for (const r of results) {
    bySource[r.sourceType] = (bySource[r.sourceType] || 0) + 1;
  }
  console.log("\nSignals by source type:");
  for (const [type, count] of Object.entries(bySource)) {
    console.log(`  ${type}: ${count}`);
  }

  console.log("\nConfidence comparison (Analyst vs Gossip Girl):");
  for (const r of results) {
    if (r.analystConfidence !== undefined && r.gossipConfidence !== undefined) {
      const diff = r.analystConfidence - r.gossipConfidence;
      const winner = diff > 0.001 ? "ANALYST" : diff < -0.001 ? "GOSSIP" : "TIE";
      console.log(`  [${r.sourceType}] "${r.title.slice(0, 40)}..."`);
      console.log(`    Analyst: ${r.analystConfidence.toFixed(3)} (match: ${r.analystSourceMatch})`);
      console.log(`    Gossip:  ${r.gossipConfidence.toFixed(3)} (match: ${r.gossipSourceMatch})`);
      console.log(`    Winner: ${winner} (diff: ${Math.abs(diff).toFixed(3)})`);
    }
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
