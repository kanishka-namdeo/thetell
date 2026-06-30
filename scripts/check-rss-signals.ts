import { prisma } from '../src/lib/db';

async function main() {
  console.log('=== Checking specific signal ===');
  const signal = await prisma.signal.findUnique({
    where: { id: 'cmquig48m000rnwlnorw0womd' },
  });

  if (signal) {
    console.log('ID:', signal.id);
    console.log('Title:', signal.title);
    console.log('Source URL:', signal.sourceUrl);
    console.log('Scraper:', signal.scraperName);
    console.log('Content Length:', signal.rawContent?.length || 0);
    console.log('\n=== Full Content ===');
    console.log(signal.rawContent);
    console.log('\n=== Created ===');
    console.log(signal.createdAt);
  } else {
    console.log('Signal not found');
  }

  console.log('\n\n=== Recent RSS signals ===');
  const rssSignals = await prisma.signal.findMany({
    where: { scraperName: 'rss-scraper' },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  for (const s of rssSignals) {
    console.log('\n---');
    console.log('ID:', s.id);
    console.log('Title:', s.title);
    console.log('Source URL:', s.sourceUrl);
    console.log('Content Length:', s.rawContent?.length || 0);
    console.log('Content Preview:', s.rawContent?.substring(0, 300));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
