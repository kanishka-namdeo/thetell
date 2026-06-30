/**
 * Query correlation pipeline results from database
 */

import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });
  
  const { prisma } = await import("../src/lib/db");

  console.log("\n=== Correlation Pipeline Results ===\n");

  // Count records
  const signalThemeCount = await prisma.signalTheme.count();
  const inferenceCount = await prisma.inference.count();
  const clusterArticleCount = await prisma.clusterArticle.count();
  const crossSignalDebateCount = await prisma.crossSignalDebate.count();

  console.log("Record Counts:");
  console.log(`  SignalTheme:        ${signalThemeCount}`);
  console.log(`  Inference:          ${inferenceCount}`);
  console.log(`  ClusterArticle:     ${clusterArticleCount}`);
  console.log(`  CrossSignalDebate:  ${crossSignalDebateCount}`);

  // Sample SignalThemes
  console.log("\n=== Sample SignalThemes (5 most recent) ===\n");
  const sampleThemes = await prisma.signalTheme.findMany({
    take: 5,
    orderBy: { lastUpdated: "desc" },
    select: {
      id: true,
      label: true,
      status: true,
      momentum: true,
      firstSeen: true,
      lastUpdated: true,
      company: { select: { name: true } },
    },
  });

  for (const t of sampleThemes) {
    console.log(`  ${t.label}`);
    console.log(`    Company: ${t.company.name}`);
    console.log(`    Status: ${t.status} | Momentum: ${t.momentum.toFixed(2)}`);
    console.log(`    First seen: ${t.firstSeen.toISOString().split("T")[0]}`);
    console.log(`    Last updated: ${t.lastUpdated.toISOString().split("T")[0]}`);
    console.log();
  }

  // Sample Inferences
  console.log("=== Sample Inferences (5 most recent) ===\n");
  const sampleInferences = await prisma.inference.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      hypothesis: true,
      confidence: true,
      status: true,
      createdAt: true,
      company: { select: { name: true } },
      theme: { select: { label: true } },
    },
  });

  for (const i of sampleInferences) {
    console.log(`  ${i.title}`);
    console.log(`    Company: ${i.company.name}`);
    console.log(`    Theme: ${i.theme?.label || "N/A"}`);
    console.log(`    Confidence: ${i.confidence.toFixed(2)} | Status: ${i.status}`);
    console.log(`    Hypothesis: ${i.hypothesis.substring(0, 100)}...`);
    console.log(`    Created: ${i.createdAt.toISOString().split("T")[0]}`);
    console.log();
  }

  // Sample ClusterArticles
  console.log("=== Sample ClusterArticles (5 most recent) ===\n");
  const sampleArticles = await prisma.clusterArticle.findMany({
    take: 5,
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      signalCount: true,
      agentPersona: true,
      status: true,
      publishedAt: true,
      company: { select: { name: true } },
      theme: { select: { label: true } },
    },
  });

  for (const a of sampleArticles) {
    console.log(`  ${a.title}`);
    console.log(`    Company: ${a.company.name}`);
    console.log(`    Theme: ${a.theme?.label || "N/A"}`);
    console.log(`    Persona: ${a.agentPersona} | Signals: ${a.signalCount}`);
    console.log(`    Status: ${a.status} | Published: ${a.publishedAt?.toISOString().split("T")[0] || "N/A"}`);
    console.log(`    Summary: ${a.summary.substring(0, 100)}...`);
    console.log();
  }

  // Sample CrossSignalDebates
  console.log("=== Sample CrossSignalDebates (3 most recent) ===\n");
  const sampleDebates = await prisma.crossSignalDebate.findMany({
    take: 3,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      consensusReached: true,
      finalConfidence: true,
      analystClaim: true,
      gossipClaim: true,
      agreements: true,
      contentions: true,
      createdAt: true,
      inference: {
        select: {
          title: true,
          company: { select: { name: true } },
        },
      },
    },
  });

  for (const d of sampleDebates) {
    console.log(`  Inference: ${d.inference.title}`);
    console.log(`    Company: ${d.inference.company.name}`);
    console.log(`    Status: ${d.status} | Consensus: ${d.consensusReached ? "Yes" : "No"}`);
    console.log(`    Final confidence: ${d.finalConfidence.toFixed(2)}`);
    console.log(`    Analyst claim: ${d.analystClaim.substring(0, 80)}...`);
    console.log(`    Gossip claim: ${d.gossipClaim.substring(0, 80)}...`);
    console.log(`    Agreements: ${d.agreements.length} | Contentions: ${d.contentions.length}`);
    console.log(`    Created: ${d.createdAt.toISOString().split("T")[0]}`);
    console.log();
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Query failed:", err);
  process.exit(1);
});
