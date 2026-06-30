import { prisma } from '../src/lib/db';

async function checkDatabase() {
  try {
    console.log('Checking database counts...\n');

    const [
      signals,
      analyses,
      articles,
      companies,
      themes,
      inferences,
      dataSources,
      enrichmentLogs,
      pipelineRuns,
    ] = await Promise.all([
      prisma.signal.count(),
      prisma.analysis.count(),
      prisma.article.count(),
      prisma.company.count(),
      prisma.signalTheme.count(),
      prisma.inference.count(),
      prisma.companyDataSource.count(),
      prisma.companyEnrichmentLog.count(),
      prisma.pipelineRun.count(),
    ]);

    console.log('Database counts:');
    console.log('- Signals:', signals);
    console.log('- Analyses:', analyses);
    console.log('- Articles:', articles);
    console.log('- Companies:', companies);
    console.log('- Themes:', themes);
    console.log('- Inferences:', inferences);
    console.log('- Data Sources:', dataSources);
    console.log('- Enrichment Logs:', enrichmentLogs);
    console.log('- Pipeline Runs:', pipelineRuns);

    // Check recent signals
    const recentSignals = await prisma.signal.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, status: true, createdAt: true },
    });
    console.log('\nRecent signals:');
    recentSignals.forEach(s => {
      console.log(`  - ${s.title} (${s.status}) - ${s.createdAt.toISOString()}`);
    });

  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
