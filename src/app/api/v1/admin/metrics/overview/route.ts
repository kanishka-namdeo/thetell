import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().min(1).max(365).default(30),
});

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/metrics/overview" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const { days } = QuerySchema.parse(Object.fromEntries(searchParams));

    log.info("admin.metrics.overview.start", { days });

    const metrics = await prisma.dailyPipelineMetrics.findMany({
      orderBy: { date: "desc" },
      take: days,
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentDay =
      metrics.find((m) => m.date.getTime() === today.getTime()) ?? metrics[0] ?? null;

    const totals = metrics.reduce(
      (acc, m) => ({
        signalsScraped: acc.signalsScraped + m.signalsScraped,
        signalsAnalyzed: acc.signalsAnalyzed + m.signalsAnalyzed,
        signalsRejected: acc.signalsRejected + m.signalsRejected,
        duplicatesSkipped: acc.duplicatesSkipped + m.duplicatesSkipped,
        totalTokensIn: acc.totalTokensIn + m.totalTokensIn,
        totalTokensOut: acc.totalTokensOut + m.totalTokensOut,
        totalLlmCalls: acc.totalLlmCalls + m.totalLlmCalls,
        clusterAnalyses: acc.clusterAnalyses + m.clusterAnalyses,
        standaloneAnalyses: acc.standaloneAnalyses + m.standaloneAnalyses,
        totalFactsRejected: acc.totalFactsRejected + m.totalFactsRejected,
      }),
      {
        signalsScraped: 0,
        signalsAnalyzed: 0,
        signalsRejected: 0,
        duplicatesSkipped: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        totalLlmCalls: 0,
        clusterAnalyses: 0,
        standaloneAnalyses: 0,
        totalFactsRejected: 0,
      }
    );

    const withConfidence = metrics.filter((m) => m.avgConfidence != null);
    const avgConfidence =
      withConfidence.length > 0
        ? withConfidence.reduce((s, m) => s + (m.avgConfidence ?? 0), 0) / withConfidence.length
        : null;

    const withLatency = metrics.filter((m) => m.avgAnalysisLatencyMs != null);
    const avgLatency =
      withLatency.length > 0
        ? Math.round(
            withLatency.reduce((s, m) => s + (m.avgAnalysisLatencyMs ?? 0), 0) /
              withLatency.length
          )
        : null;

    return NextResponse.json({
      timeSeries: metrics.map((m) => ({
        date: m.date.toISOString().slice(0, 10),
        signalsScraped: m.signalsScraped,
        signalsAnalyzed: m.signalsAnalyzed,
        signalsRejected: m.signalsRejected,
        totalTokensIn: m.totalTokensIn,
        totalTokensOut: m.totalTokensOut,
        avgConfidence: m.avgConfidence,
        avgAnalysisLatencyMs: m.avgAnalysisLatencyMs,
      })),
      currentDay: currentDay
        ? {
            date: currentDay.date.toISOString().slice(0, 10),
            signalsScraped: currentDay.signalsScraped,
            signalsAnalyzed: currentDay.signalsAnalyzed,
            signalsRejected: currentDay.signalsRejected,
            duplicatesSkipped: currentDay.duplicatesSkipped,
            qualityGatePassRate: currentDay.qualityGatePassRate,
            clusterAnalyses: currentDay.clusterAnalyses,
            standaloneAnalyses: currentDay.standaloneAnalyses,
            totalTokensIn: currentDay.totalTokensIn,
            totalTokensOut: currentDay.totalTokensOut,
            totalLlmCalls: currentDay.totalLlmCalls,
            avgConfidence: currentDay.avgConfidence,
            medianConfidence: currentDay.medianConfidence,
            avgAnalysisLatencyMs: currentDay.avgAnalysisLatencyMs,
            p95AnalysisLatencyMs: currentDay.p95AnalysisLatencyMs,
            avgGroundingScore: currentDay.avgGroundingScore,
            totalFactsRejected: currentDay.totalFactsRejected,
          }
        : null,
      totals: {
        ...totals,
        avgConfidence,
        avgAnalysisLatencyMs: avgLatency,
        daysWithData: metrics.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_error", message: "Invalid query parameters", details: error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    log.error("admin.metrics.overview.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch overview metrics" },
      { status: 500 }
    );
  }
}
