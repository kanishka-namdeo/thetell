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
  
  // Query 2: Articles for this signal's company
  console.log('\n\n2. Articles for this signal\'s company:');
  const articles = await prisma.article.findMany({
    where: { companyId: signal.companyId },
    include: { company: true, inference: true }
  });
  
  console.log('Found', articles.length, 'article(s)');
  console.log(JSON.stringify(articles, null, 2));
  
  // Query 3: All themes/clusters this signal belongs to
  console.log('\n\n3. All themes/clusters this signal belongs to:');
  const themes = await prisma.signalTheme.findMany({
    where: { signals: { some: { id: signalId } } },
    include: { company: true, signals: true, inferences: true }
  });
  
  console.log('Found', themes.length, 'theme(s)');
  console.log(JSON.stringify(themes, null, 2));
  
  // Query 4: Cluster articles for this signal's themes
  console.log('\n\n4. Cluster articles for this signal\'s themes:');
  if (themes.length > 0) {
    const clusterArticles = await prisma.clusterArticle.findMany({
      where: { themeId: { in: themes.map(t => t.id) } },
      include: { theme: true, company: true }
    });
    console.log('Found', clusterArticles.length, 'cluster article(s)');
    console.log(JSON.stringify(clusterArticles, null, 2));
  } else {
    console.log('No themes, skipping cluster articles query.');
  }
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
