import { config } from "dotenv";

async function main() {
  // Load environment variables BEFORE importing db
  config({ path: ".env.local" });

  // Dynamic import to ensure env vars are loaded first
  const { prisma } = await import("../src/lib/db");

  const companies = await prisma.company.count();
  const signals = await prisma.signal.count();
  const analyses = await prisma.analysis.count();
  const articles = await prisma.article.count();
  const dataSources = await prisma.companyDataSource.count();
  const pipelineRuns = await prisma.pipelineRun.count();
  const failedRuns = await prisma.pipelineRun.count({ where: { status: "FAILED" } });
  const successRuns = await prisma.pipelineRun.count({ where: { status: "COMPLETED" } });
  const runningRuns = await prisma.pipelineRun.count({ where: { status: "RUNNING" } });

  console.log("=== DB Overview ===");
  console.log("Companies:", companies);
  console.log("Signals:", signals);
  console.log("Analyses:", analyses);
  console.log("Articles:", articles);
  console.log("Data Sources:", dataSources);
  console.log("Pipeline Runs:", pipelineRuns);
  console.log("  Success:", successRuns);
  console.log("  Failed:", failedRuns);
  console.log("  Running:", runningRuns);

  const signalsPerCompany = await prisma.company.findMany({
    select: {
      name: true,
      id: true,
      _count: { select: { signals: true, dataSources: true } },
    },
    orderBy: { signals: { _count: "desc" } },
    take: 25,
  });

  console.log("\n=== Signals per Company (top 25) ===");
  for (const c of signalsPerCompany) {
    console.log(
      c.name.padEnd(30),
      "signals:",
      String(c._count.signals).padStart(3),
      "| sources:",
      c._count.dataSources
    );
  }

  const zeroSignalCompanies = await prisma.company.count({
    where: { signals: { none: {} } },
  });
  console.log("\nCompanies with ZERO signals:", zeroSignalCompanies, "of", companies);

  const zeroSourceCompanies = await prisma.company.count({
    where: { dataSources: { none: {} } },
  });
  console.log("Companies with ZERO data sources:", zeroSourceCompanies, "of", companies);

  // Check enrichment logs
  const enrichmentLogs = await prisma.companyEnrichmentLog.count();
  console.log("\nEnrichment logs:", enrichmentLogs);

  // Check recent pipeline run errors
  const recentFailed = await prisma.pipelineRun.findMany({
    where: { status: "FAILED" },
    orderBy: { startedAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      error: true,
      startedAt: true,
      companyId: true,
    },
  });
  if (recentFailed.length > 0) {
    console.log("\n=== Recent Failed Pipeline Runs ===");
    for (const r of recentFailed) {
      console.log(r.startedAt?.toISOString() ?? "N/A", "|", r.companyId, "|", r.error?.slice(0, 100));
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
