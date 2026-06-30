import { prisma } from '../src/lib/db';

async function checkSignal() {
  const signal = await prisma.signal.findUnique({
    where: { id: 'cmquig48m000rnwlnorw0womd' },
  });

  if (signal) {
    console.log('=== Signal Details ===');
    console.log('ID:', signal.id);
    console.log('Title:', signal.title);
    console.log('Source URL:', signal.sourceUrl);
    console.log('Scraper:', signal.scraperName);
    console.log('Content Length:', signal.rawContent?.length || 0);
    console.log('\n=== Content Preview (first 500 chars) ===');
    console.log(signal.rawContent?.substring(0, 500));
    console.log('\n=== Content Preview (last 200 chars) ===');
    console.log(signal.rawContent?.substring(signal.rawContent.length - 200));
  } else {
    console.log('Signal not found');
  }
}

checkSignal()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
