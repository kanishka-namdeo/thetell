import { prisma } from './src/lib/db.js';

async function main() {
  const companyCount = await prisma.company.count();
  const signalCount = await prisma.signal.count();
  const analysisCount = await prisma.analysis.count();
  
  console.log('Company count:', companyCount);
  console.log('Signal count:', signalCount);
  console.log('Analysis count:', analysisCount);
  
  if (companyCount > 0) {
    const companies = await prisma.company.findMany({
      take: 5,
      select: { id: true, name: true }
    });
    console.log('Sample companies:', companies);
  }
  
  await prisma.$disconnect();
}

main();