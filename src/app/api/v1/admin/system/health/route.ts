import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { getAllScrapers, getApiKeyRequiredScrapers } from "@/lib/scraping/registry";

function maskApiKey(value: string | undefined): string {
  if (!value) return "Not configured";
  if (value.length <= 8) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, 3)}...${value.slice(-3)}`;
}

export async function GET() {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/system/health" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    log.info("admin.system.health.start");

    const allScrapers = getAllScrapers();
    const apiKeyScrapers = getApiKeyRequiredScrapers();

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const scrapers = allScrapers.map((entry) => {
      const name = entry.scraper.constructor.name.replace("Scraper", "");
      return {
        name,
        enabled: entry.enabled,
        apiKeyConfigured: Object.values(entry.config).every((v) => !!v),
        lastRunAt: null as Date | null,
        lastSuccessAt: null as Date | null,
        successRate: entry.enabled ? 100 : 0,
        errorCount: 0,
      };
    });

    const apiKeys = apiKeyScrapers.map((scraper) => {
      const envValue = process.env[scraper.envVar];
      return {
        name: scraper.name,
        configured: scraper.configured,
        masked: maskApiKey(envValue),
      };
    });

    const [
      totalSignals,
      totalArticles,
      totalUsers,
      totalCompanies,
      recentSignals,
      recentAnalyses,
      avgConfidence,
      failedSignals,
      pendingSignals,
      // Correlation metrics
      totalThemes,
      activeInferences,
      confirmedInferences,
      refutedInferences,
      lastCorrelationJob,
      // Calibration metrics
      totalCalibrations,
      correctCalibrations,
    ] = await Promise.all([
      prisma.signal.count(),
      prisma.article.count(),
      prisma.user.count(),
      prisma.company.count(),
      prisma.signal.count({ where: { scrapedAt: { gte: oneHourAgo } } }),
      prisma.analysis.count({ where: { analyzedAt: { gte: oneHourAgo } } }),
      prisma.analysis.aggregate({ _avg: { confidence: true } }),
      prisma.signal.count({ where: { status: "FAILED" } }),
      prisma.signal.count({ where: { status: "PENDING" } }),
      // Correlation metrics
      prisma.signalTheme.count(),
      prisma.inference.count({
        where: { status: { in: ["EMERGING", "DEVELOPING"] } },
      }),
      prisma.inference.count({ where: { status: "CONFIRMED" } }),
      prisma.inference.count({ where: { status: "REFUTED" } }),
      prisma.job.findFirst({
        where: { type: "correlate-signals", status: "completed" },
        orderBy: { completedAt: "desc" },
      }),
      // Calibration metrics
      prisma.inferenceCalibration.count({
        where: { resolvedAt: { not: null } },
      }),
      prisma.inferenceCalibration.count({
        where: { wasCorrect: true },
      }),
    ]);

    const totalProcessed = totalSignals - pendingSignals - failedSignals;
    const errorRate = totalSignals > 0 ? (failedSignals / totalSignals) * 100 : 0;
    const calibrationAccuracy =
      totalCalibrations > 0 ? (correctCalibrations / totalCalibrations) * 100 : null;

    const metrics = {
      signalsPerHour: recentSignals,
      analysesPerHour: recentAnalyses,
      averageProcessingTime: 0,
      errorRate: Math.round(errorRate * 100) / 100,
      averageConfidence: avgConfidence._avg.confidence || 0,
      totalSignals,
      totalArticles,
      totalUsers,
      totalCompanies,
      pendingSignals,
      failedSignals,
      totalProcessed,
      // Correlation metrics
      correlation: {
        lastRunAt: lastCorrelationJob?.completedAt?.toISOString() || null,
        totalThemes,
        activeInferences,
        confirmedInferences,
        refutedInferences,
      },
      // Calibration metrics
      calibration: {
        totalCalibrations,
        correctCalibrations,
        accuracy: calibrationAccuracy,
      },
    };

    const jobs = {
      pending: pendingSignals,
      running: 0,
      failed: failedSignals,
      completed: totalProcessed,
    };

    const recentErrors: Array<{
      id: string;
      source: string;
      message: string;
      timestamp: Date;
      signalId?: string;
    }> = [];

    const failedSignalList = await prisma.signal.findMany({
      where: { status: "FAILED" },
      take: 25,
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, sourceType: true, updatedAt: true },
    });

    for (const s of failedSignalList) {
      recentErrors.push({
        id: s.id,
        source: "analysis",
        message: `Analysis failed: ${s.title.slice(0, 80)}`,
        timestamp: s.updatedAt,
        signalId: s.id,
      });
    }

    log.info("admin.system.health.success", { metrics });

    return NextResponse.json({
      scrapers,
      apiKeys,
      metrics,
      jobs,
      recentErrors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error("admin.system.health.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch system health" },
      { status: 500 }
    );
  }
}
