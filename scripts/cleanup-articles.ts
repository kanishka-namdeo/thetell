import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: '.env.local' });

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

function sanitizeUnicode(text: string): string {
  return text.replace(/[^\x00-\x7F]/g, '');
}

async function cleanup() {
  console.log('=== CLEANUP SCRIPT ===\n');

  // 1. Fix Unicode in articles
  console.log('1. Fixing Unicode characters in articles...');
  const allArticles = await prisma.article.findMany();
  const unicodeRegex = /[^\x00-\x7F]/;
  let fixedCount = 0;

  for (const article of allArticles) {
    if (unicodeRegex.test(article.body) || unicodeRegex.test(article.summary) || unicodeRegex.test(article.title)) {
      await prisma.article.update({
        where: { id: article.id },
        data: {
          title: sanitizeUnicode(article.title),
          summary: sanitizeUnicode(article.summary),
          body: sanitizeUnicode(article.body),
        },
      });
      console.log(`   ✓ Fixed: ${article.title}`);
      fixedCount++;
    }
  }
  console.log(`   Fixed ${fixedCount} articles\n`);

  // 2. Remove duplicate articles (keep newest)
  console.log('2. Removing duplicate articles...');
  const articles = await prisma.article.findMany({
    orderBy: { publishedAt: 'desc' },
  });

  const seen = new Map<string, string>(); // key -> articleId (keep first/newest)
  let duplicateCount = 0;

  for (const article of articles) {
    const analysisIds = Array.isArray(article.analysisIds) ? article.analysisIds : [];
    const key = `${article.companyId}-${article.agentPersona}-${analysisIds.sort().join(',')}`;

    if (seen.has(key)) {
      // This is a duplicate, delete it
      await prisma.article.delete({ where: { id: article.id } });
      console.log(`   ✓ Deleted duplicate: ${article.title}`);
      duplicateCount++;
    } else {
      seen.set(key, article.id);
    }
  }
  console.log(`   Removed ${duplicateCount} duplicate articles\n`);

  console.log('Cleanup complete!');
  await prisma.$disconnect();
}

cleanup().catch((error) => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});
