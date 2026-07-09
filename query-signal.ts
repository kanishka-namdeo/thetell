import 'dotenv/config';
import { prisma } from './src/lib/db';

async function main() {
  const signalId = 'cmqw39ut2004ea8lnuhoixjw3';
  
  console.log('=== QUERYING SIGNAL DATA ===\n');
  
  // Query 1: Signal with all relations
  console.log('1. Signal with company, analyses, debates, and themes:');
  const signal = await prisma.signal.findUnique({
    where: { id: signalId },
    include: {
      company: true,
      analyses: true,
      debates: true,
      themes: true,
      cluster: true,
    }
  });
  
  if (!signal) {
    console.log('Signal not found');
    await prisma.$disconnect();
    return;
  }
  
  console.log(JSON.stringify(signal, null, 2));
  
  // Query 2: All themes/clusters this signal belongs to
  console.log('\n\n2. All themes/clusters this signal belongs to:');
  const themes = await prisma.signalTheme.findMany({
    where: { signals: { some: { id: signalId } } },
    include: { company: true, signals: true }
  });
  
  console.log('Found', themes.length, 'theme(s)');
  console.log(JSON.stringify(themes, null, 2));
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
