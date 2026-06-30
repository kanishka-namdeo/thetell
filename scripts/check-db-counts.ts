import { prisma } from '../src/lib/db';

async function main() {
  console.log('Checking database counts...\n');

  const [
    signalCount,
    articleCount,
    companyCount,
    analysisCount,
    themeCount,
    inferenceCount,
    dataSourceCount,
    enrichmentCount,
  ] = await Promise.all([
    prisma.signal.count(),
    prisma.article.count(),
    prisma.company.count(),
    prisma.analysis.count(),
    prisma.signalTheme.count(),
    prisma.inference.count(),
    prisma.companyDataSource.count(),
    prisma.companyEnrichmentLog.count(),
  ]);

  console.log('Signal:', signalCount);
  console.log('Article:', articleCount);
  console.log('Company:', companyCount);
  console.log('Analysis:', analysisCount);
  console.log('SignalTheme:', themeCount);
  console.log('Inference:', inferenceCount);
  console.log('CompanyDataSource:', dataSourceCount);
  console.log('CompanyEnrichmentLog:', enrichmentCount);

  await prisma.$disconnect();
}

main().catch(console.error);
