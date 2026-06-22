import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function validate() {
  console.log('=== VALIDATION RESULTS ===\n');

  // 1. Confidence score distribution
  console.log('1. CONFIDENCE SCORE DISTRIBUTION:');
  const confidenceStats = await prisma.analysis.groupBy({
    by: ['agentPersona'],
    _count: { confidence: true },
    _avg: { confidence: true },
    _min: { confidence: true },
    _max: { confidence: true },
  });

  for (const stat of confidenceStats) {
    console.log(`   ${stat.agentPersona}:`);
    console.log(`     Count: ${stat._count.confidence}`);
    console.log(`     Avg: ${(stat._avg.confidence! * 100).toFixed(1)}%`);
    console.log(`     Min: ${(stat._min.confidence! * 100).toFixed(1)}%`);
    console.log(`     Max: ${(stat._max.confidence! * 100).toFixed(1)}%`);
  }

  // 2. Sentiment distribution
  console.log('\n2. SENTIMENT DISTRIBUTION:');
  const sentimentStats = await prisma.analysis.groupBy({
    by: ['agentPersona', 'sentiment'],
    _count: { sentiment: true },
  });

  for (const stat of sentimentStats) {
    console.log(`   ${stat.agentPersona} - ${stat.sentiment}: ${stat._count.sentiment}`);
  }

  // 3. Check for Unicode characters in articles
  console.log('\n3. UNICODE CHARACTERS IN ARTICLES:');
  const allArticlesForCheck = await prisma.article.findMany({
    select: { id: true, title: true, body: true },
  });

  const unicodeRegex = /[^\x00-\x7F]/;
  const articlesWithUnicode = allArticlesForCheck.filter((a) =>
    unicodeRegex.test(a.body)
  );

  if (articlesWithUnicode.length === 0) {
    console.log('   ✓ No Unicode characters found');
  } else {
    console.log(`   ✗ Found ${articlesWithUnicode.length} articles with Unicode:`);
    for (const article of articlesWithUnicode) {
      console.log(`     - ${article.id}: ${article.title}`);
    }
  }

  // 4. Check for duplicate articles
  console.log('\n4. DUPLICATE ARTICLES:');
  const allArticlesForDup = await prisma.article.findMany({
    select: { companyId: true, agentPersona: true, analysisIds: true },
  });

  const articleCounts = new Map<string, number>();
  for (const article of allArticlesForDup) {
    const analysisIds = Array.isArray(article.analysisIds) ? article.analysisIds : [];
    const key = `${article.companyId}-${article.agentPersona}-${analysisIds.sort().join(',')}`;
    articleCounts.set(key, (articleCounts.get(key) || 0) + 1);
  }

  const duplicates = Array.from(articleCounts.entries()).filter(([_, count]) => count > 1);

  if (duplicates.length === 0) {
    console.log('   ✓ No duplicate articles found');
  } else {
    console.log(`   ✗ Found ${duplicates.length} duplicate article groups:`);
    for (const [key, count] of duplicates) {
      console.log(`     - ${key}: ${count} articles`);
    }
  }

  // 5. Summary statistics
  console.log('\n5. SUMMARY STATISTICS:');
  const totalAnalyses = await prisma.analysis.count();
  const totalArticles = await prisma.article.count();
  const totalSignals = await prisma.signal.count();

  console.log(`   Total signals: ${totalSignals}`);
  console.log(`   Total analyses: ${totalAnalyses}`);
  console.log(`   Total articles: ${totalArticles}`);

  await prisma.$disconnect();
}

validate().catch((error) => {
  console.error('Validation failed:', error);
  process.exit(1);
});
