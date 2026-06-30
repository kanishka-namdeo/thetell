import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!requireAdmin(session)) {
    return NextResponse.json(
      { error: "forbidden", message: "Admin access required" },
      { status: 403 }
    );
  }

  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "control-center" });

  try {
    log.info("api.control_center.start");

    const [
      // Sources stage
      totalSources,
      healthySources,
      failedSources,
      lastSourceHealthCheck,

      // Enrichment stage
      lastEnrichmentRun,
      companiesEnriched,

      // Discovery stage
      lastDiscoveryRun,
      signalsDiscovered24h,
      signalsPending,

      // Analysis stage
      signalsAnalyzed,
      signalsPendingAnalysis,
      avgConfidenceResult,

      // Correlation stage
      lastCorrelationRun,
      themesDetected,
      inferencesGenerated,

      // Articles stage
      articlesGenerated,
      articlesPending,
    ] = await Promise.all([
      // Sources
      prisma.companyDataSource.count(),
      prisma.companyDataSource.count({ where: { isActive: true, consecutiveFailures: 0 } }),
      prisma.companyDataSource.count({ where: { consecutiveFailures: { gte: 3 } } }),
      prisma.pipelineRun.findFirst({
        where: { scraperName: "source-health-check" },
        orderBy: { createdAt: "desc" },
        select: { completedAt: true, status: true },
      }),

      // Enrichment
      prisma.companyEnrichmentLog.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.companyEnrichmentLog.count(),

      // Discovery
      prisma.pipelineRun.findFirst({
        orderBy: { createdAt: "desc" },
        select: { completedAt: true, status: true },
      }),
      prisma.signal.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
      prisma.signal.count({ where: { status: "PENDING" } }),

      // Analysis
      prisma.signal.count({ where: { status: "ANALYZED" } }),
      prisma.signal.count({ where: { status: "PENDING" } }),
      prisma.analysis.aggregate({
        _avg: { confidence: true },
      }),

      // Correlation
      prisma.pipelineRun.findFirst({
        where: { scraperName: "correlation" },
        orderBy: { createdAt: "desc" },
        select: { completedAt: true, status: true },
      }),
      prisma.signalTheme.count(),
      prisma.inference.count(),

      // Articles
      prisma.article.count({ where: { status: "PUBLISHED" } }),
      prisma.article.count({ where: { status: "DRAFT" } }),
    ]);

    const avgConfidence = avgConfidenceResult._avg.confidence ?? 0;

    const response = {
      stages: {
        sources: {
          lastRun: lastSourceHealthCheck?.completedAt?.toISOString() ?? null,
          status: deriveStatus(lastSourceHealthCheck),
          metrics: { totalSources, healthySources, failedSources },
        },
        enrichment: {
          lastRun: lastEnrichmentRun?.createdAt?.toISOString() ?? null,
          status: lastEnrichmentRun ? "completed" : "idle",
          metrics: { companiesEnriched, pendingEnrichment: 0 },
        },
        discovery: {
          lastRun: lastDiscoveryRun?.completedAt?.toISOString() ?? null,
          status: deriveStatus(lastDiscoveryRun),
          metrics: { signalsDiscovered24h, signalsPending },
        },
        analysis: {
          lastRun: null,
          status: "idle",
          metrics: {
            signalsAnalyzed,
            signalsPending: signalsPendingAnalysis,
            avgConfidence: Math.round(avgConfidence * 100) / 100,
          },
        },
        correlation: {
          lastRun: lastCorrelationRun?.completedAt?.toISOString() ?? null,
          status: deriveStatus(lastCorrelationRun),
          metrics: { themesDetected, inferencesGenerated },
        },
        articles: {
          lastRun: null,
          status: "idle",
          metrics: { articlesGenerated, articlesPending },
        },
      },
      activeJobs: 0,
      recentActivity: [],
    };

    log.info("api.control_center.success");
    return NextResponse.json(response);
  } catch (error) {
    log.error("api.control_center.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch control center data" },
      { status: 500 }
    );
  }
}

function deriveStatus(run: { completedAt: Date | null; status: string } | null): string {
  if (!run) return "idle";
  if (run.status === "running") return "running";
  if (run.status === "failed") return "error";
  if (run.completedAt) {
    const minutesAgo = (Date.now() - new Date(run.completedAt).getTime()) / 60_000;
    if (minutesAgo < 30) return "recently_completed";
  }
  return "idle";
}
