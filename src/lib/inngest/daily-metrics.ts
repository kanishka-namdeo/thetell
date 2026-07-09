/**
 * Daily rollup metrics computation.
 * Runs at 3 AM UTC (after the 2 AM discovery cron) to aggregate
 * pipeline metrics from the previous day into DailyPipelineMetrics.
 */

import { inngest } from "./client";
import { cron } from "inngest";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

/**
 * Returns UTC start-of-day for a given date offset (0 = today, -1 = yesterday).
 */
function getUtcDayBoundary(offsetDays: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export const computeDailyMetricsFunction = inngest.createFunction(
  {
    id: "compute-daily-metrics",
    triggers: [cron("0 3 * * *")],
    retries: 2,
    timeouts: { finish: "10m" },
  },
  async ({ step }) => {
    const log = logger.child({ function: "compute-daily-metrics" });

    const dayStart = getUtcDayBoundary(-1);
    const dayEnd = getUtcDayBoundary(0);
    const dateOnly = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate()));

    log.info("daily_metrics.start", { date: dateOnly.toISOString().slice(0, 10) });

    // Step 1: Signal volumes from Signal model (using scrapedAt)
    const signalCounts = await step.run("count-signals", async () => {
      const [scraped, analyzed, rejected] = await Promise.all([
        prisma.signal.count({
          where: { scrapedAt: { gte: dayStart, lt: dayEnd } },
        }),
        prisma.signal.count({
          where: { scrapedAt: { gte: dayStart, lt: dayEnd }, status: "ANALYZED" },
        }),
        prisma.signal.count({
          where: { scrapedAt: { gte: dayStart, lt: dayEnd }, status: "LOW_QUALITY" },
        }),
      ]);

      log.info("daily_metrics.signal_counts", { scraped, analyzed, rejected });
      return { scraped, analyzed, rejected };
    });

    // Step 2: Aggregate AnalysisMetrics for the day
    const metricsAgg = await step.run("aggregate-analysis-metrics", async () => {
      const result = await prisma.analysisMetrics.aggregate({
        where: { analyzedAt: { gte: dayStart, lt: dayEnd } },
        _count: true,
        _sum: {
          tokensIn: true,
          tokensOut: true,
          llmCallCount: true,
          invalidFactCount: true,
        },
        _avg: {
          qualityScore: true,
          groundingScore: true,
          totalLatencyMs: true,
        },
      });

      log.info("daily_metrics.metrics_aggregated", { count: result._count });
      return result;
    });

    // Step 3: Routing breakdown (cluster vs standalone)
    const routingCounts = await step.run("count-routing", async () => {
      const metrics = await prisma.analysisMetrics.findMany({
        where: { analyzedAt: { gte: dayStart, lt: dayEnd } },
        select: { analysisPath: true },
      });

      const cluster = metrics.filter((m) => m.analysisPath === "cluster").length;
      const standalone = metrics.filter((m) => m.analysisPath === "standalone").length;

      log.info("daily_metrics.routing_counts", { cluster, standalone });
      return { cluster, standalone };
    });

    // Step 4: Confidence stats from Analysis table (analyses for signals scraped that day)
    const confidenceStats = await step.run("compute-confidence-stats", async () => {
      const analyses = await prisma.analysis.findMany({
        where: {
          signal: { scrapedAt: { gte: dayStart, lt: dayEnd } },
        },
        select: { confidence: true },
      });

      if (analyses.length === 0) {
        return { avg: null, median: null };
      }

      const confidences = analyses.map((a) => a.confidence).sort((a, b) => a - b);
      const sum = confidences.reduce((acc, c) => acc + c, 0);
      const avg = sum / confidences.length;
      const mid = Math.floor(confidences.length / 2);
      const median = confidences.length % 2 !== 0
        ? confidences[mid]
        : (confidences[mid - 1] + confidences[mid]) / 2;

      return { avg, median };
    });

    // Step 5: Latency percentiles from AnalysisMetrics
    const latencyStats = await step.run("compute-latency-stats", async () => {
      const metrics = await prisma.analysisMetrics.findMany({
        where: {
          analyzedAt: { gte: dayStart, lt: dayEnd },
          totalLatencyMs: { not: null },
        },
        select: { totalLatencyMs: true },
      });

      if (metrics.length === 0) {
        return { avg: null, p95: null };
      }

      const latencies = metrics
        .map((m) => m.totalLatencyMs)
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b);

      if (latencies.length === 0) {
        return { avg: null, p95: null };
      }

      const avg = Math.round(latencies.reduce((acc, l) => acc + l, 0) / latencies.length);
      const p95Index = Math.ceil(latencies.length * 0.95) - 1;
      const p95 = latencies[Math.max(0, p95Index)];

      return { avg, p95 };
    });

    // Step 6: Per-source-type breakdown
    const bySourceType = await step.run("compute-source-breakdown", async () => {
      const metrics = await prisma.analysisMetrics.findMany({
        where: { analyzedAt: { gte: dayStart, lt: dayEnd } },
        select: {
          signal: { select: { sourceType: true } },
          qualityScore: true,
          groundingScore: true,
          tokensIn: true,
          tokensOut: true,
        },
      });

      const grouped: Record<string, { count: number; totalTokensIn: number; totalTokensOut: number; qualityScores: number[]; groundingScores: number[] }> = {};

      for (const m of metrics) {
        const st = m.signal.sourceType;
        if (!grouped[st]) {
          grouped[st] = { count: 0, totalTokensIn: 0, totalTokensOut: 0, qualityScores: [], groundingScores: [] };
        }
        grouped[st].count++;
        grouped[st].totalTokensIn += m.tokensIn;
        grouped[st].totalTokensOut += m.tokensOut;
        if (m.qualityScore !== null) grouped[st].qualityScores.push(m.qualityScore);
        if (m.groundingScore !== null) grouped[st].groundingScores.push(m.groundingScore);
      }

      const result: Record<string, { count: number; avgQualityScore: number | null; avgGroundingScore: number | null; totalTokensIn: number; totalTokensOut: number }> = {};

      for (const [sourceType, data] of Object.entries(grouped)) {
        result[sourceType] = {
          count: data.count,
          avgQualityScore: data.qualityScores.length > 0
            ? data.qualityScores.reduce((a, b) => a + b, 0) / data.qualityScores.length
            : null,
          avgGroundingScore: data.groundingScores.length > 0
            ? data.groundingScores.reduce((a, b) => a + b, 0) / data.groundingScores.length
            : null,
          totalTokensIn: data.totalTokensIn,
          totalTokensOut: data.totalTokensOut,
        };
      }

      log.info("daily_metrics.source_breakdown", { sourceTypes: Object.keys(result).length });
      return result;
    });

    // Step 7: Upsert daily rollup
    await step.run("upsert-daily-metrics", async () => {
      const totalAnalyses = metricsAgg._count;
      const qualityGatePassRate = signalCounts.scraped > 0
        ? signalCounts.analyzed / signalCounts.scraped
        : null;

      await prisma.dailyPipelineMetrics.upsert({
        where: { date: dateOnly },
        update: {
          signalsScraped: signalCounts.scraped,
          signalsAnalyzed: signalCounts.analyzed,
          signalsRejected: signalCounts.rejected,
          qualityGatePassRate,
          clusterAnalyses: routingCounts.cluster,
          standaloneAnalyses: routingCounts.standalone,
          totalTokensIn: metricsAgg._sum.tokensIn ?? 0,
          totalTokensOut: metricsAgg._sum.tokensOut ?? 0,
          totalLlmCalls: metricsAgg._sum.llmCallCount ?? 0,
          avgConfidence: confidenceStats.avg,
          medianConfidence: confidenceStats.median,
          avgAnalysisLatencyMs: latencyStats.avg,
          p95AnalysisLatencyMs: latencyStats.p95,
          avgGroundingScore: metricsAgg._avg.groundingScore ?? null,
          totalFactsRejected: metricsAgg._sum.invalidFactCount ?? 0,
          bySourceType: bySourceType as Prisma.InputJsonValue,
        },
        create: {
          date: dateOnly,
          signalsScraped: signalCounts.scraped,
          signalsAnalyzed: signalCounts.analyzed,
          signalsRejected: signalCounts.rejected,
          qualityGatePassRate,
          clusterAnalyses: routingCounts.cluster,
          standaloneAnalyses: routingCounts.standalone,
          totalTokensIn: metricsAgg._sum.tokensIn ?? 0,
          totalTokensOut: metricsAgg._sum.tokensOut ?? 0,
          totalLlmCalls: metricsAgg._sum.llmCallCount ?? 0,
          avgConfidence: confidenceStats.avg,
          medianConfidence: confidenceStats.median,
          avgAnalysisLatencyMs: latencyStats.avg,
          p95AnalysisLatencyMs: latencyStats.p95,
          avgGroundingScore: metricsAgg._avg.groundingScore ?? null,
          totalFactsRejected: metricsAgg._sum.invalidFactCount ?? 0,
          bySourceType: bySourceType as Prisma.InputJsonValue,
        },
      });

      log.info("daily_metrics.upserted", { date: dateOnly.toISOString().slice(0, 10) });
    });

    log.info("daily_metrics.complete", {
      date: dateOnly.toISOString().slice(0, 10),
      signalsScraped: signalCounts.scraped,
      signalsAnalyzed: signalCounts.analyzed,
      totalAnalyses: metricsAgg._count,
    });

    return {
      success: true,
      date: dateOnly.toISOString().slice(0, 10),
      signalsScraped: signalCounts.scraped,
      signalsAnalyzed: signalCounts.analyzed,
      signalsRejected: signalCounts.rejected,
      totalAnalyses: metricsAgg._count,
    };
  }
);
