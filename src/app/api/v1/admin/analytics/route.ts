import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { z } from "zod";

const QuerySchema = z.object({
  dateRange: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
  groupBy: z.enum(["day", "week", "month"]).default("day"),
});

function getDateRange(range: string): Date | null {
  if (range === "all") return null;

  const now = new Date();
  switch (range) {
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/analytics" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = QuerySchema.parse(Object.fromEntries(searchParams));

    log.info("admin.analytics.get.start", { query });

    const dateFrom = getDateRange(query.dateRange);
    const dateFilter = dateFrom ? { gte: dateFrom } : undefined;

    const [
      totalSignals,
      totalUsers,
      totalCompanies,
      signalsWithConfidence,
      signalsBySource,
      sentimentBreakdown,
      modelUsage,
      activeUsers,
      newSignups,
      topAnalyses,
    ] = await Promise.all([
      prisma.signal.count({ where: dateFilter ? { scrapedAt: dateFilter } : undefined }),
      prisma.user.count(),
      prisma.company.count(),
      prisma.analysis.aggregate({
        where: dateFilter ? { analyzedAt: dateFilter } : undefined,
        _avg: { confidence: true },
      }),
      prisma.signal.groupBy({
        by: ["sourceType"],
        where: dateFilter ? { scrapedAt: dateFilter } : undefined,
        _count: { id: true },
      }),
      prisma.analysis.groupBy({
        by: ["sentiment"],
        where: dateFilter ? { analyzedAt: dateFilter } : undefined,
        _count: { id: true },
      }),
      prisma.analysis.groupBy({
        by: ["modelUsed"],
        where: dateFilter ? { analyzedAt: dateFilter } : undefined,
        _count: { id: true },
      }),
      prisma.user.count({
        where: {
          status: "ACTIVE",
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      }),
      prisma.user.count({
        where: dateFilter ? { createdAt: dateFilter } : undefined,
      }),
      prisma.analysis.findMany({
        where: dateFilter ? { analyzedAt: dateFilter } : undefined,
        take: 10,
        orderBy: { analyzedAt: "desc" },
        select: {
          id: true,
          keyFacts: true,
          confidence: true,
          sentiment: true,
          signal: {
            select: {
              id: true,
              title: true,
              companyId: true,
            },
          },
        },
      }),
    ]);

    const averageConfidence = signalsWithConfidence._avg.confidence || 0;

    // Get confidence distribution using aggregate queries to avoid loading all rows
    const confidenceDistribution = await Promise.all([
      prisma.analysis.count({
        where: {
          ...(dateFilter ? { analyzedAt: dateFilter } : {}),
          confidence: { gte: 0, lt: 0.2 },
        },
      }),
      prisma.analysis.count({
        where: {
          ...(dateFilter ? { analyzedAt: dateFilter } : {}),
          confidence: { gte: 0.2, lt: 0.4 },
        },
      }),
      prisma.analysis.count({
        where: {
          ...(dateFilter ? { analyzedAt: dateFilter } : {}),
          confidence: { gte: 0.4, lt: 0.6 },
        },
      }),
      prisma.analysis.count({
        where: {
          ...(dateFilter ? { analyzedAt: dateFilter } : {}),
          confidence: { gte: 0.6, lt: 0.8 },
        },
      }),
      prisma.analysis.count({
        where: {
          ...(dateFilter ? { analyzedAt: dateFilter } : {}),
          confidence: { gte: 0.8, lte: 1.0 },
        },
      }),
    ]).then((counts) => [
      { range: "0.0-0.2", count: counts[0] },
      { range: "0.2-0.4", count: counts[1] },
      { range: "0.4-0.6", count: counts[2] },
      { range: "0.6-0.8", count: counts[3] },
      { range: "0.8-1.0", count: counts[4] },
    ]);

    const scraperPerformance = await Promise.all(
      signalsBySource.map(async (s) => {
        const result = await prisma.analysis.aggregate({
          where: {
            signal: { sourceType: s.sourceType },
            ...(dateFilter ? { analyzedAt: dateFilter } : {}),
          },
          _avg: { confidence: true },
        });
        return {
          sourceType: s.sourceType,
          signalCount: s._count.id,
          successRate: 1.0,
          averageConfidence: result._avg.confidence || 0,
        };
      })
    );

    const sentimentData = sentimentBreakdown.map((s) => ({
      sentiment: s.sentiment,
      count: s._count.id,
    }));

    const modelData = modelUsage.map((m) => ({
      model: m.modelUsed,
      count: m._count.id,
    }));

    const analysesPerUser = totalUsers > 0 ? signalsWithConfidence._avg.confidence || 0 : 0;

    const analysisPerformance = topAnalyses.map((analysis) => ({
      id: analysis.id,
      signalId: analysis.signal.id,
      title: analysis.signal.title,
      confidence: analysis.confidence,
      sentiment: analysis.sentiment,
      keyFacts: analysis.keyFacts,
    }));

    const response = {
      overview: {
        totalSignals,
        totalUsers,
        totalCompanies,
        averageConfidence,
      },
      scraperPerformance,
      aiPerformance: {
        confidenceDistribution,
        sentimentBreakdown: sentimentData,
        modelUsage: modelData,
      },
      userEngagement: {
        activeUsers,
        newSignups,
        averageAnalysesPerUser: analysesPerUser,
      },
      analysisPerformance,
    };

    log.info("admin.analytics.get.success");
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Invalid query parameters",
          details: error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    log.error("admin.analytics.get.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
