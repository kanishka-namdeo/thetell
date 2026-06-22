import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const signals = await prisma.signal.count();
  console.log('Signals:', signals);
  
  const analyses = await prisma.analysis.count();
  console.log('Analyses:', analyses);
  
  const companies = await prisma.company.count();
  console.log('Companies:', companies);
  
  const themes = await prisma.signalTheme.count();
  console.log('Themes:', themes);
  
  const debates = await prisma.agentDebate.count();
  console.log('Agent debates:', debates);
  
  if (analyses > 0) {
    const sample = await prisma.analysis.findFirst({
      include: { signal: true }
    });
    if (sample) {
      console.log('\nSample analysis:');
      console.log('Signal:', sample.signal.title);
      console.log('Persona:', sample.agentPersona);
      console.log('Confidence:', sample.confidence);
      console.log('Themes:', JSON.stringify(sample.strategicThemes, null, 2));
    }
  }
  
  await prisma.$disconnect();
}

main();
