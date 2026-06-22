import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const total = await prisma.crossSignalDebate.count();
  console.log('Total CrossSignalDebate records:', total);
  
  const withTranscript = await prisma.crossSignalDebate.count({
    where: { debateTranscript: { not: '' } }
  });
  console.log('With transcript:', withTranscript);
  
  const withAnalystClaim = await prisma.crossSignalDebate.count({
    where: { analystClaim: { not: '' } }
  });
  console.log('With analystClaim:', withAnalystClaim);
  
  const sample = await prisma.crossSignalDebate.findFirst();
  if (sample) {
    console.log('\nSample record:');
    console.log('ID:', sample.id);
    console.log('Inference ID:', sample.inferenceId);
    console.log('Transcript length:', sample.debateTranscript.length);
    console.log('Analyst claim:', sample.analystClaim);
    console.log('Transcript preview:', sample.debateTranscript.substring(0, 200));
  }
  
  await prisma.$disconnect();
}

main();
