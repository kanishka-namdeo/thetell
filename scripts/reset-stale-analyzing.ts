import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
  
  console.log('Resetting stale ANALYZING signals (>10min old) to PENDING...');
  
  const result = await prisma.signal.updateMany({
    where: {
      status: 'ANALYZING',
      updatedAt: { lt: staleThreshold },
    },
    data: { status: 'PENDING' },
  });
  
  console.log(`✓ Reset ${result.count} signals from ANALYZING to PENDING`);
  
  // Verify the change
  const statusCounts = await prisma.signal.groupBy({
    by: ['status'],
    _count: true,
  });
  console.log('\nUpdated signal status counts:');
  console.log(JSON.stringify(statusCounts, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await pool.end();
    await prisma.$disconnect();
  });
