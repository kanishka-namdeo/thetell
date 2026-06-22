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
      totalArticles,
      totalUsers,
      totalCompanies,
      signalsWithConfidence,
      signalsBySource,
      sentimentBreakdown,
      modelUsage,
      activeUsers,
      newSignups,
      topContent,
    ] = await Promise.all([
      prisma.signal.count({ where: dateFilter ? { scrapedAt: dateFilter } : undefined }),
      prisma.article.count({ where: dateFilter ? { publishedAt: dateFilter } : undefined }),
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
      prisma.article.findMany({
        where: dateFilter ? { publishedAt: dateFilter } : undefined,
        take: 10,
        orderBy: { publishedAt: "desc" },
        select: {
          id: true,
          title: true,
          companyId: true,
          status: true,
        },
      }),
    ]);

    const averageConfidence = signalsWithConfidence._avg.confidence || 0;

    // Get confidence distribution using groupBy
    const confidenceBuckets = await prisma.analysis.groupBy({
      by: ["confidence"],
      where: dateFilter ? { analyzedAt: dateFilter } : undefined,
    });

    const confidenceDistribution = [
      { range: "0.0-0.2", count: 0 },
      { range: "0.2-0.4", count: 0 },
      { range: "0.4-0.6", count: 0 },
      { range: "0.6-0.8", count: 0 },
      { range: "0.8-1.0", count: 0 },
    ];

    for (const bucket of confidenceBuckets) {
      const idx = Math.min(Math.floor(bucket.confidence * 5), 4);
      confidenceDistribution[idx].count++;
    }

    const scraperPerformance = await Promise.all(
      signalsBySource.map(async (s) => {
        const analyses = await prisma.analysis.findMany({
          where: {
            signal: { sourceType: s.sourceType },
            ...(dateFilter ? { analyzedAt: dateFilter } : {}),
          },
          select: { confidence: true },
        });

        const avgConf =
          analyses.length > 0
            ? analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length
            : 0;

        return {
          sourceType: s.sourceType,
          signalCount: s._count.id,
          successRate: 1.0,
          averageConfidence: avgConf,
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

    const articlesPerUser = totalUsers > 0 ? totalArticles / totalUsers : 0;

    const contentPerformance = await Promise.all(
      topContent.map(async (article) => {
        const analyses = await prisma.analysis.findMany({
          where: {
            signal: { companyId: article.companyId },
            ...(dateFilter ? { analyzedAt: dateFilter } : {}),
          },
          select: { confidence: true },
        });

        const avgConf =
          analyses.length > 0
            ? analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length
            : 0;

        return {
          id: article.id,
          title: article.title,
          views: article.status === "PUBLISHED" ? 1 : 0,
          confidence: avgConf,
        };
      })
    );

    const response = {
      overview: {
        totalSignals,
        totalArticles,
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
        averageArticlesPerUser: articlesPerUser,
      },
      contentPerformance,
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
