import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const signalId = 'cmqxooy74003peklnwdkb5so4';
  
  const signal = await prisma.signal.findUnique({
    where: { id: signalId },
    include: {
      analyses: true,
      company: { select: { name: true } }
    }
  });

  if (!signal) {
    console.log('Signal not found');
    await prisma.$disconnect();
    return;
  }

  console.log('Signal:', signal.id);
  console.log('Title:', signal.title);
  console.log('Status:', signal.status);
  console.log('Company:', signal.company?.name);
  console.log('Analyses count:', signal.analyses.length);
  console.log('Updated at:', signal.updatedAt);
  console.log('Created at:', signal.createdAt);

  if (signal.analyses.length > 0) {
    console.log('\nAnalyses:');
    signal.analyses.forEach(a => {
      console.log(`  - ${a.agentPersona}: confidence ${a.confidence}`);
      console.log(`    Summary: ${a.summary?.substring(0, 100)}...`);
      console.log(`    Created: ${a.analyzedAt}`);
    });
  } else {
    console.log('\nNo analyses found for this signal');
  }

  // Check if there are any recent analysis records for this company
  const recentAnalyses = await prisma.analysis.findMany({
    where: { signal: { companyId: signal.companyId } },
    orderBy: { analyzedAt: 'desc' },
    take: 5,
    include: { signal: { select: { title: true, status: true } } }
  });

  console.log('\nRecent analyses for this company:');
  recentAnalyses.forEach(a => {
    console.log(`  - ${a.agentPersona} for "${a.signal.title?.substring(0, 50)}..." (${a.signal.status})`);
    console.log(`    Confidence: ${a.confidence}, Created: ${a.analyzedAt}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
