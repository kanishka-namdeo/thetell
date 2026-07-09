import { prisma } from "../src/lib/db";

async function main() {
  const [signals, articles, inferences, clusterArticles, themes] = await Promise.all([
    prisma.signal.findMany({
      where: { status: "ANALYZED" },
      select: { id: true, title: true, sourceType: true },
      take: 5,
      orderBy: { scrapedAt: "desc" },
    }),
    prisma.article.findMany({
      where: { status: "PUBLISHED" },
      select: { id: true, title: true, agentPersona: true },
      take: 5,
      orderBy: { publishedAt: "desc" },
    }),
    prisma.inference.findMany({
      select: { id: true, title: true, status: true, confidence: true },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    prisma.clusterArticle.findMany({
      where: { status: "PUBLISHED" },
      select: { id: true, title: true, agentPersona: true, signalCount: true },
      take: 5,
      orderBy: { publishedAt: "desc" },
    }),
    prisma.signalTheme.findMany({
      select: { id: true, label: true, status: true, momentum: true },
      take: 5,
      orderBy: { lastUpdated: "desc" },
    }),
  ]);

  console.log("=== ANALYZED SIGNALS ===");
  for (const s of signals) {
    console.log(`${s.id} | ${s.title?.slice(0, 60)} | ${s.sourceType}`);
    console.log(`  → /signals/${s.id}`);
  }

  console.log("\n=== ARTICLES (per-signal) ===");
  for (const a of articles) {
    console.log(`${a.id} | ${a.title?.slice(0, 60)} | ${a.agentPersona}`);
    console.log(`  → /articles/${a.id}`);
  }

  console.log("\n=== INFERENCES ===");
  for (const i of inferences) {
    console.log(`${i.id} | ${i.title?.slice(0, 60)} | ${i.status} | conf=${i.confidence}`);
    console.log(`  → /inferences/${i.id}`);
  }

  console.log("\n=== CLUSTER ARTICLES ===");
  for (const c of clusterArticles) {
    console.log(`${c.id} | ${c.title?.slice(0, 60)} | ${c.agentPersona} | ${c.signalCount} signals`);
    console.log(`  → /articles/${c.id}`);
  }

  console.log("\n=== THEMES (clusters) ===");
  for (const t of themes) {
    console.log(`${t.id} | ${t.label?.slice(0, 50)} | ${t.status} | momentum=${t.momentum?.toFixed(3)}`);
    console.log(`  → /clusters/${t.id}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
