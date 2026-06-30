import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  const signal = await prisma.signal.findUnique({
    where: { id: 'cmquig48m000rnwlnorw0womd' },
  });
  if (signal) {
    console.log('Title:', signal.title);
    console.log('Source URL:', signal.sourceUrl);
    console.log('Scraper:', signal.scraperName);
    console.log('Content Length:', signal.rawContent?.length || 0);
    console.log('Content:', signal.rawContent);
  } else {
    console.log('Signal not found');
  }

  console.log('\n=== RSS signals content lengths ===');
  const rssSignals = await prisma.signal.findMany({
    where: { scraperName: 'rss-scraper' },
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: { id: true, title: true, sourceUrl: true, rawContent: true, createdAt: true },
  });
  for (const s of rssSignals) {
    console.log(`${s.createdAt.toISOString().slice(0,10)} | len=${(s.rawContent||'').length.toString().padStart(5)} | ${s.title.slice(0,60)}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
