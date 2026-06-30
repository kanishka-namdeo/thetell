const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Querying database state...\n');

  // Count signals with analyses
  const signalsWithAnalyses = await prisma.signal.findMany({
    where: { analyses: { some: {} } },
    include: {
      analyses: { 
        select: { 
          id: true, 
          agentPersona: true, 
          confidence: true, 
          summary: true, 
          strategicThemes: true, 
          keyFacts: true, 
          sentiment: true 
        } 
      },
      company: { 
        select: { 
          id: true, 
          name: true, 
          slug: true 
        } 
      }
    }
  });
  
  console.log('=== SIGNALS WITH ANALYSES ===');
  console.log('Total signals with analyses:', signalsWithAnalyses.length);
  
  for (const s of signalsWithAnalyses) {
    console.log('\nSignal:', s.id);
    console.log('  Title:', s.title?.substring(0, 80));
    console.log('  SourceType:', s.sourceType);
    console.log('  Company:', s.company?.name);
    console.log('  Status:', s.status);
    console.log('  Analyses:', s.analyses.length);
    for (const a of s.analyses) {
      console.log('    -', a.agentPersona, '| confidence:', a.confidence, '| themes:', (a.strategicThemes || []).length);
    }
  }
  
  // Count existing articles
  const articles = await prisma.article.count();
  console.log('\n=== EXISTING ARTICLES ===');
  console.log('Total articles:', articles);
  
  // Count existing inferences
  const inferences = await prisma.inference.count();
  console.log('\n=== EXISTING INFERENCES ===');
  console.log('Total inferences:', inferences);
  
  // Count signal themes
  const themes = await prisma.signalTheme.count();
  console.log('\n=== EXISTING THEMES ===');
  console.log('Total themes:', themes);
  
  await prisma.$disconnect();
}

main().catch(e => { 
  console.error(e); 
  process.exit(1); 
});
