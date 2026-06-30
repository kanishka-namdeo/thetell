import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Companies in Database ===');
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      ticker: true,
      industry: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  
  console.log(JSON.stringify(companies, null, 2));
  
  console.log('\n=== Subreddit Discovery Logs ===');
  const logs = await prisma.subredditDiscoveryLog.findMany({
    include: {
      company: {
        select: { name: true, slug: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  
  console.log(JSON.stringify(logs, null, 2));
  
  console.log('\n=== Tracked Subreddits ===');
  const subreddits = await prisma.trackedSubreddit.findMany({
    include: {
      company: {
        select: { name: true, slug: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  
  console.log(JSON.stringify(subreddits, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
