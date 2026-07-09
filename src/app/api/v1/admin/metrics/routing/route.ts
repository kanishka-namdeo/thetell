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
  const log = logger.child({ requestId, route: "GET /api/v1/admin/metrics/routing" });

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

    log.info("admin.metrics.routing.start", { days });

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);

    const [metrics, clusterSimilarity, clusterTokens, standaloneTokens] = await Promise.all([
      prisma.dailyPipelineMetrics.findMany({
        where: { date: { gte: cutoff } },
        orderBy: { date: "desc" },
      }),
      prisma.analysisMetrics.aggregate({
        where: { analysisPath: "cluster" },
        _avg: { clusterSimilarity: true },
      }),
      prisma.analysisMetrics.aggregate({
        where: { analysisPath: "cluster" },
        _avg: { tokensIn: true, tokensOut: true },
      }),
      prisma.analysisMetrics.aggregate({
        where: { analysisPath: "standalone" },
        _avg: { tokensIn: true, tokensOut: true },
      }),
    ]);

    return NextResponse.json({
      routingBreakdown: metrics.map((m) => ({
        date: m.date.toISOString().slice(0, 10),
        clusterAnalyses: m.clusterAnalyses,
        standaloneAnalyses: m.standaloneAnalyses,
      })),
      avgClusterSimilarity: clusterSimilarity._avg.clusterSimilarity ?? null,
      avgTokensPerPath: {
        cluster: {
          avgTokensIn: Math.round(clusterTokens._avg.tokensIn ?? 0),
          avgTokensOut: Math.round(clusterTokens._avg.tokensOut ?? 0),
        },
        standalone: {
          avgTokensIn: Math.round(standaloneTokens._avg.tokensIn ?? 0),
          avgTokensOut: Math.round(standaloneTokens._avg.tokensOut ?? 0),
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_error", message: "Invalid query parameters", details: error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    log.error("admin.metrics.routing.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch routing metrics" },
      { status: 500 }
    );
  }
}
