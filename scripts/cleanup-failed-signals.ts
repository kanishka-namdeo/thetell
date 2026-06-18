import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const result = await prisma.signal.deleteMany({ where: { status: 'FAILED' } });
  console.log('Deleted', result.count, 'failed signals');
  await prisma.$disconnect();
}

main();
