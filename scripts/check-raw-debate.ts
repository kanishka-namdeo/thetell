import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const debate = await prisma.crossSignalDebate.findFirst({
    include: { inference: true }
  });
  
  if (debate) {
    console.log('=== RAW DEBATE TRANSCRIPT ===');
    console.log(debate.debateTranscript);
    console.log('\n=== PARSED STRUCTURE ===');
    try {
      const parsed = JSON.parse(debate.debateTranscript);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('Failed to parse as JSON');
    }
  }
  
  await prisma.$disconnect();
}

main();
