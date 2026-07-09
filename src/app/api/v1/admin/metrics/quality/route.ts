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
  const log = logger.child({ requestId, route: "GET /api/v1/admin/metrics/quality" });

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

    log.info("admin.metrics.quality.start", { days });

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);

    const [metrics, qualityDistribution] = await Promise.all([
      prisma.dailyPipelineMetrics.findMany({
        where: { date: { gte: cutoff } },
        orderBy: { date: "desc" },
      }),
      Promise.all([
        prisma.analysisMetrics.count({
          where: { qualityScore: { gte: 0, lt: 0.2 } },
        }),
        prisma.analysisMetrics.count({
          where: { qualityScore: { gte: 0.2, lt: 0.4 } },
        }),
        prisma.analysisMetrics.count({
          where: { qualityScore: { gte: 0.4, lt: 0.6 } },
        }),
        prisma.analysisMetrics.count({
          where: { qualityScore: { gte: 0.6, lt: 0.8 } },
        }),
        prisma.analysisMetrics.count({
          where: { qualityScore: { gte: 0.8, lte: 1.0 } },
        }),
      ]),
    ]);

    return NextResponse.json({
      qualityGatePassRate: metrics.map((m) => ({
        date: m.date.toISOString().slice(0, 10),
        value: m.qualityGatePassRate,
      })),
      avgGroundingScore: metrics.map((m) => ({
        date: m.date.toISOString().slice(0, 10),
        value: m.avgGroundingScore,
      })),
      totalFactsRejected: metrics.map((m) => ({
        date: m.date.toISOString().slice(0, 10),
        value: m.totalFactsRejected,
      })),
      qualityScoreDistribution: [
        { range: "0.0-0.2", count: qualityDistribution[0] },
        { range: "0.2-0.4", count: qualityDistribution[1] },
        { range: "0.4-0.6", count: qualityDistribution[2] },
        { range: "0.6-0.8", count: qualityDistribution[3] },
        { range: "0.8-1.0", count: qualityDistribution[4] },
      ],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_error", message: "Invalid query parameters", details: error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    log.error("admin.metrics.quality.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch quality metrics" },
      { status: 500 }
    );
  }
}
