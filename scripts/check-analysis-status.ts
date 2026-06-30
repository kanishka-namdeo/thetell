import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const totalSignals = await prisma.signal.count();
  console.log('Total signals:', totalSignals);

  const analyzedSignals = await prisma.signal.count({
    where: { analyses: { some: {} } }
  });
  console.log('Signals with analysis:', analyzedSignals);

  const unanalyzedSignals = await prisma.signal.count({
    where: { analyses: { none: {} } }
  });
  console.log('Signals without analysis:', unanalyzedSignals);

  const recentSignals = await prisma.signal.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      title: true,
      sourceType: true,
      status: true,
      createdAt: true,
      analyses: { select: { id: true, analyzedAt: true } },
      _count: { select: { analyses: true } }
    }
  });

  console.log('\nRecent signals:');
  for (const s of recentSignals) {
    const analyzed = s._count.analyses > 0 ? 'ANALYZED' : 'PENDING';
    console.log(`  [${analyzed}] ${s.sourceType}: ${s.title?.substring(0, 60)}... (${s.createdAt.toLocaleDateString()})`);
  }

  const recentRuns = await prisma.pipelineRun.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      scraperName: true,
      status: true,
      signalsCreated: true,
      duplicatesSkipped: true,
      createdAt: true
    }
  });

  console.log('\nRecent pipeline runs:');
  for (const r of recentRuns) {
    console.log(`  ${r.scraperName}: ${r.status} (${r.signalsCreated} signals, ${r.duplicatesSkipped} dupes) - ${r.createdAt.toLocaleDateString()}`);
  }

  console.log('\nSignal statuses:');
  const statusCounts = await prisma.signal.groupBy({
    by: ['status'],
    _count: true
  });
  console.log(statusCounts);

  await prisma.$disconnect();
}

main().catch(console.error);
