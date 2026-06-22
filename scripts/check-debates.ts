import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const count = await prisma.crossSignalDebate.count();
  console.log('Total debates:', count);
  
  const withClaims = await prisma.crossSignalDebate.count({
    where: { analystClaim: { not: '' } }
  });
  console.log('Debates with claims:', withClaims);
  
  const sample = await prisma.crossSignalDebate.findFirst({
    where: { analystClaim: { not: '' } },
    include: { inference: { include: { company: true } } }
  });
  
  if (sample) {
    console.log('\nSample debate:');
    console.log('Inference:', sample.inference.title);
    console.log('Company:', sample.inference.company.name);
    console.log('Analyst claim:', sample.analystClaim.substring(0, 100));
    console.log('Gossip claim:', sample.gossipClaim.substring(0, 100));
    console.log('Agreements:', sample.agreements.length);
    console.log('Contentions:', sample.contentions.length);
  }
  
  await prisma.$disconnect();
}

main();
