import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('=== ANALYZED SIGNALS (first 5) ===');
  const signals = await prisma.signal.findMany({
    where: { status: 'ANALYZED' },
    select: { id: true, title: true, sourceType: true },
    take: 5,
    orderBy: { scrapedAt: 'desc' }
  });
  
  for (const s of signals) {
    console.log(`${s.title} (${s.sourceType})`);
    console.log(`  URL: http://localhost:3000/signals/${s.id}`);
  }

  console.log('\n=== ARTICLES (first 5) ===');
  const articles = await prisma.article.findMany({
    where: { status: 'PUBLISHED' },
    select: { id: true, title: true, agentPersona: true },
    take: 5,
    orderBy: { publishedAt: 'desc' }
  });
  
  for (const a of articles) {
    console.log(`${a.title} (${a.agentPersona})`);
    console.log(`  URL: http://localhost:3000/articles/${a.id}`);
  }

  console.log('\n=== INFERENCES (first 5) ===');
  const inferences = await prisma.inference.findMany({
    select: { id: true, title: true, status: true, confidence: true },
    take: 5,
    orderBy: { createdAt: 'desc' }
  });
  
  for (const i of inferences) {
    console.log(`${i.title} (${i.status}, ${i.confidence})`);
    console.log(`  URL: http://localhost:3000/inferences/${i.id}`);
  }

  console.log('\n=== CLUSTER ARTICLES (first 5) ===');
  const clusterArticles = await prisma.clusterArticle.findMany({
    where: { status: 'PUBLISHED' },
    select: { id: true, title: true, agentPersona: true, signalCount: true },
    take: 5,
    orderBy: { publishedAt: 'desc' }
  });
  
  for (const ca of clusterArticles) {
    console.log(`${ca.title} (${ca.agentPersona}, ${ca.signalCount} signals)`);
    console.log(`  URL: http://localhost:3000/articles/${ca.id}`);
  }

  console.log('\n=== THEMES/CLUSTERS (first 5) ===');
  const themes = await prisma.signalTheme.findMany({
    select: { id: true, label: true, status: true, momentum: true },
    take: 5,
    orderBy: { lastUpdated: 'desc' }
  });
  
  for (const t of themes) {
    console.log(`${t.label} (${t.status}, momentum: ${t.momentum})`);
    console.log(`  URL: http://localhost:3000/clusters/${t.id}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
