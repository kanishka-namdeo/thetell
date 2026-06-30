import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Check if AMD company exists
  const amdCompany = await prisma.company.findFirst({
    where: {
      OR: [
        { name: { contains: 'AMD', mode: 'insensitive' } },
        { ticker: { equals: 'AMD', mode: 'insensitive' } }
      ]
    }
  });
  
  console.log('=== AMD Company Check ===');
  if (amdCompany) {
    console.log('AMD Company found:', {
      id: amdCompany.id,
      name: amdCompany.name,
      ticker: amdCompany.ticker,
      websiteUrl: amdCompany.websiteUrl
    });
    
    // Check for signals
    const amdSignals = await prisma.signal.count({
      where: { companyId: amdCompany.id }
    });
    console.log(`Signals for AMD: ${amdSignals}`);
    
    // Check for data sources
    const dataSources = await prisma.companyDataSource.findMany({
      where: { companyId: amdCompany.id }
    });
    console.log(`Data sources for AMD: ${dataSources.length}`);
    dataSources.forEach(ds => {
      console.log(`  - ${ds.sourceType}: ${ds.url} (${ds.isActive ? 'active' : 'inactive'})`);
    });
    
    // List actual signals if any
    if (amdSignals > 0) {
      const signals = await prisma.signal.findMany({
        where: { companyId: amdCompany.id },
        take: 5
      });
      console.log('\nSample signals:');
      signals.forEach(s => console.log(`  - ${s.title} (${s.sourceType})`));
    }
  } else {
    console.log('AMD company NOT found in database');
    
    // List all companies
    const allCompanies = await prisma.company.findMany({
      select: { id: true, name: true, ticker: true }
    });
    console.log('\nAll companies in database:');
    allCompanies.forEach(c => console.log(`  - ${c.name} (${c.ticker}): ${c.id}`));
  }
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
