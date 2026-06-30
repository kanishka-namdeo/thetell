import { prisma } from "../src/lib/db";

async function main() {
  console.log("=== Cluster Quality Test ===\n");

  // 1. Status distribution
  const statusCounts = await prisma.signalTheme.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  console.log("Cluster status distribution:");
  for (const s of statusCounts) {
    console.log(`  ${s.status}: ${s._count.id}`);
  }

  // 2. Totals
  const total = await prisma.signalTheme.count();
  const withEmb = await prisma.signalTheme.count({
    where: { embedding: { not: null } },
  });
  console.log(`\nTotal clusters: ${total} | With embeddings: ${withEmb}`);

  // 3. Signal clustering
  const clustered = await prisma.signal.count({
    where: { clusterId: { not: null } },
  });
  const unclustered = await prisma.signal.count({
    where: { clusterId: null, status: "ANALYZED" },
  });
  console.log(
    `Clustered signals: ${clustered} | Unclustered analyzed: ${unclustered}`
  );

  // 4. Cluster articles
  const articles = await prisma.clusterArticle.count();
  console.log(`Cluster articles: ${articles}`);

  // 5. Top clusters by momentum
  const topClusters = await prisma.signalTheme.findMany({
    select: {
      id: true,
      label: true,
      status: true,
      momentum: true,
      lastUpdated: true,
      firstSeen: true,
      _count: { select: { clusteredSignals: true } },
    },
    orderBy: { momentum: "desc" },
    take: 10,
  });
  console.log("\nTop clusters by momentum:");
  for (const t of topClusters) {
    console.log(
      `  ${t.label} | ${t.status} | momentum: ${t.momentum} | signals: ${t._count.clusteredSignals}`
    );
  }

  // 6. Check for deprecated data (clusters with null momentum that should have values)
  const nullMomentum = await prisma.signalTheme.count({
    where: { momentum: 0 },
  });
  console.log(`\nClusters with zero momentum: ${nullMomentum}`);

  // 7. Check for clusters with null lastUpdated (should all have values)
  const recentClusters = await prisma.signalTheme.findMany({
    select: { id: true, label: true, lastUpdated: true, firstSeen: true },
    orderBy: { lastUpdated: "desc" },
    take: 5,
  });
  console.log("\nMost recently updated clusters:");
  for (const c of recentClusters) {
    console.log(
      `  ${c.label} | lastUpdated: ${c.lastUpdated.toISOString()} | firstSeen: ${c.firstSeen.toISOString()}`
    );
  }

  // 8. Check inferences
  const inferences = await prisma.inference.count();
  const inferenceStatusCounts = await prisma.inference.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  console.log(`\nInferences: ${inferences} total`);
  console.log("Inference status distribution:");
  for (const s of inferenceStatusCounts) {
    console.log(`  ${s.status}: ${s._count.id}`);
  }

  // 9. Check cluster articles per persona
  const analystArticles = await prisma.clusterArticle.count({
    where: { agentPersona: "ANALYST" },
  });
  const gossipArticles = await prisma.clusterArticle.count({
    where: { agentPersona: "GOSSIP_GIRL" },
  });
  console.log(
    `Cluster articles by persona: Analyst=${analystArticles}, GossipGirl=${gossipArticles}`
  );

  console.log("\n=== Cluster Quality Test Complete ===");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
