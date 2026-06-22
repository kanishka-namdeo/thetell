import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const totalInferences = await prisma.inference.count();
  console.log('Total Inference records:', totalInferences);
  
  const withDebateId = await prisma.inference.count({
    where: { debateId: { not: null } }
  });
  console.log('Inferences with debateId:', withDebateId);
  
  const inferences = await prisma.inference.findMany({
    take: 5,
    select: {
      id: true,
      title: true,
      debateId: true,
      createdAt: true,
    }
  });
  
  console.log('\nSample inferences:');
  inferences.forEach(inf => {
    console.log(`- ${inf.title}`);
    console.log(`  ID: ${inf.id}`);
    console.log(`  Debate ID: ${inf.debateId || 'null'}`);
    console.log(`  Created: ${inf.createdAt}`);
  });
  
  await prisma.$disconnect();
}

main();
