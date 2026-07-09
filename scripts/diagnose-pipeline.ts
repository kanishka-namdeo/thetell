import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Signal status counts
  const statusCounts = await prisma.signal.groupBy({
    by: ['status'],
    _count: true,
  });
  console.log('=== Signal Status Counts ===');
  console.log(JSON.stringify(statusCounts, null, 2));

  // Total counts
  const totalSignals = await prisma.signal.count();
  const totalAnalyses = await prisma.analysis.count();
  const totalArticles = await prisma.article.count();
  const totalCompanies = await prisma.company.count();
  
  console.log('\n=== Totals ===');
  console.log(`Total signals: ${totalSignals}`);
  console.log(`Total analyses: ${totalAnalyses}`);
  console.log(`Total articles: ${totalArticles}`);
  console.log(`Total companies: ${totalCompanies}`);

  // Check signals with analyses
  const signalsWithAnalysis = await prisma.signal.count({
    where: { analyses: { some: {} } },
  });
  console.log(`\nSignals with analysis: ${signalsWithAnalysis}`);

  // Sample PENDING signals
  const pendingSignals = await prisma.signal.findMany({
    where: { status: 'PENDING' },
    take: 5,
    select: { id: true, title: true, status: true, sourceType: true, companyId: true, createdAt: true, updatedAt: true },
  });
  console.log('\n=== Sample PENDING Signals ===');
  console.log(JSON.stringify(pendingSignals, null, 2));

  // Sample ANALYZING signals (might be stuck)
  const analyzingSignals = await prisma.signal.findMany({
    where: { status: 'ANALYZING' },
    take: 5,
    select: { id: true, title: true, status: true, updatedAt: true },
    orderBy: { updatedAt: 'asc' },
  });
  console.log('\n=== Sample ANALYZING Signals (oldest first) ===');
  console.log(JSON.stringify(analyzingSignals, null, 2));

  // Sample ANALYZED signals
  const analyzedSignals = await prisma.signal.findMany({
    where: { status: 'ANALYZED' },
    take: 3,
    include: { 
      analyses: { select: { id: true, agentPersona: true, confidence: true } },
      company: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  console.log('\n=== Sample ANALYZED Signals ===');
  console.log(JSON.stringify(analyzedSignals.map(s => ({
    id: s.id,
    title: s.title?.slice(0, 50),
    status: s.status,
    analysisCount: s.analyses.length,
    analyses: s.analyses.map(a => ({ persona: a.agentPersona, confidence: a.confidence })),
    companyName: s.company?.name,
    updatedAt: s.updatedAt,
  })), null, 2));

  // Check FAILED signals
  const failedCount = await prisma.signal.count({ where: { status: 'FAILED' } });
  console.log(`\nFAILED signals: ${failedCount}`);

  // Check recent articles
  const recentArticles = await prisma.article.findMany({
    take: 3,
    orderBy: { publishedAt: 'desc' },
    select: { id: true, title: true, status: true, agentPersona: true, publishedAt: true, companyId: true },
  });
  console.log('\n=== Recent Articles ===');
  console.log(JSON.stringify(recentArticles, null, 2));

  // Check env vars
  console.log('\n=== Environment ===');
  console.log(`INNGEST_SIGNING_KEY set: ${!!process.env.INNGEST_SIGNING_KEY}`);
  console.log(`API_KEY set: ${!!process.env.API_KEY}`);
  console.log(`BASE_URL: ${process.env.BASE_URL || 'NOT SET'}`);
  console.log(`FAST_MODEL: ${process.env.FAST_MODEL || 'NOT SET'}`);
  console.log(`REASONING_MODEL: ${process.env.REASONING_MODEL || 'NOT SET'}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
    await prisma.$disconnect();
  });
