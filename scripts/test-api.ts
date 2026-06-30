import { prisma } from '../src/lib/db';

async function testControlCenterAPI() {
  try {
    console.log('Testing Control Center API logic...\n');

    const [
      totalSources,
      healthySources,
      failedSources,
      lastSourceHealthCheck,
      lastEnrichmentRun,
      companiesEnriched,
      lastDiscoveryRun,
      signalsDiscovered24h,
      signalsPending,
      signalsAnalyzed,
      signalsPendingAnalysis,
      avgConfidenceResult,
      lastCorrelationRun,
      themesDetected,
      inferencesGenerated,
      articlesGenerated,
      articlesPending,
    ] = await Promise.all([
      prisma.companyDataSource.count(),
      prisma.companyDataSource.count({ where: { isActive: true, consecutiveFailures: 0 } }),
      prisma.companyDataSource.count({ where: { consecutiveFailures: { gte: 3 } } }),
      prisma.pipelineRun.findFirst({
        where: { scraperName: "source-health-check" },
        orderBy: { createdAt: "desc" },
        select: { completedAt: true, status: true },
      }),
      prisma.companyEnrichmentLog.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.companyEnrichmentLog.count(),
      prisma.pipelineRun.findFirst({
        orderBy: { createdAt: "desc" },
        select: { completedAt: true, status: true },
      }),
      prisma.signal.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
      prisma.signal.count({ where: { status: "PENDING" } }),
      prisma.signal.count({ where: { status: "ANALYZED" } }),
      prisma.signal.count({ where: { status: "PENDING" } }),
      prisma.analysis.aggregate({
        _avg: { confidence: true },
      }),
      prisma.pipelineRun.findFirst({
        where: { scraperName: "correlation" },
        orderBy: { createdAt: "desc" },
        select: { completedAt: true, status: true },
      }),
      prisma.signalTheme.count(),
      prisma.inference.count(),
      prisma.article.count({ where: { status: "PUBLISHED" } }),
      prisma.article.count({ where: { status: "DRAFT" } }),
    ]);

    console.log('API Response:');
    console.log('- Sources:', { totalSources, healthySources, failedSources, lastRun: lastSourceHealthCheck?.completedAt });
    console.log('- Enrichment:', { companiesEnriched, pendingEnrichment: 0, lastRun: lastEnrichmentRun?.createdAt });
    console.log('- Discovery:', { signalsDiscovered24h, signalsPending, lastRun: lastDiscoveryRun?.completedAt });
    console.log('- Analysis:', { signalsAnalyzed, signalsPendingAnalysis, avgConfidence: avgConfidenceResult._avg.confidence });
    console.log('- Correlation:', { themesDetected, inferencesGenerated, lastRun: lastCorrelationRun?.completedAt });
    console.log('- Articles:', { articlesGenerated, articlesPending });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testControlCenterAPI();
