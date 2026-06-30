import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Get an inference with a good debate (has real claims)
  const inference = await prisma.inference.findFirst({
    where: {
      debate: {
        analystClaim: { not: '' },
      }
    },
    include: {
      company: true,
      debate: true,
    },
  });

  if (inference) {
    console.log(`Inference ID: ${inference.id}`);
    console.log(`Title: ${inference.title}`);
    console.log(`URL: http://localhost:3000/inferences/${inference.id}`);
  } else {
    console.log('No inference with good debate found');
  }

  // Also get one with any debate
  const anyInference = await prisma.inference.findFirst({
    where: { debateId: { not: null } },
    include: { company: true, debate: true },
  });

  if (anyInference) {
    console.log(`\nAny inference ID: ${anyInference.id}`);
    console.log(`URL: http://localhost:3000/inferences/${anyInference.id}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
