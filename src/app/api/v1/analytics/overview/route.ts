import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const rawDays = parseInt(searchParams.get("days") || "30");
    const days = Number.isNaN(rawDays) ? 30 : Math.min(Math.max(rawDays, 1), 365);

    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    const analysisWhere: Prisma.AnalysisWhereInput = {
      analyzedAt: { gte: dateThreshold },
      ...(companyId ? { signal: { companyId } } : {}),
    };

    const [sentimentTrends, confidenceDistribution, sourceBreakdown] = await Promise.all([
      getSentimentTrends(analysisWhere, days),
      getConfidenceDistribution(analysisWhere),
      getSourceBreakdown(companyId, days),
    ]);

    return NextResponse.json({
      sentimentTrends,
      confidenceDistribution,
      sourceBreakdown,
    });
  } catch (error) {
    logger.error("Error fetching analytics overview", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch analytics overview" },
      { status: 500 }
    );
  }
}

async function getSentimentTrends(where: Prisma.AnalysisWhereInput, days: number) {
  // Use aggregation instead of loading all records
  const trends: { date: string; positive: number; negative: number; neutral: number }[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    const dateStr = date.toISOString().split("T")[0];
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const [positive, negative, neutral] = await Promise.all([
      prisma.analysis.count({
        where: { ...where, sentiment: "POSITIVE", analyzedAt: { gte: date, lt: nextDate } },
      }),
      prisma.analysis.count({
        where: { ...where, sentiment: "NEGATIVE", analyzedAt: { gte: date, lt: nextDate } },
      }),
      prisma.analysis.count({
        where: { ...where, sentiment: "NEUTRAL", analyzedAt: { gte: date, lt: nextDate } },
      }),
    ]);

    trends.push({ date: dateStr, positive, negative, neutral });
  }

  return trends;
}

async function getConfidenceDistribution(where: Prisma.AnalysisWhereInput) {
  // Use aggregation instead of loading all records
  const [high, medium, low] = await Promise.all([
    prisma.analysis.count({ where: { ...where, confidence: { gte: 0.8 } } }),
    prisma.analysis.count({ where: { ...where, confidence: { gte: 0.5, lt: 0.8 } } }),
    prisma.analysis.count({ where: { ...where, confidence: { lt: 0.5 } } }),
  ]);

  return [
    { bucket: "High (80-100%)", count: high },
    { bucket: "Medium (50-80%)", count: medium },
    { bucket: "Low (0-50%)", count: low },
  ];
}

async function getSourceBreakdown(companyId: string | null, days: number) {
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);

  const where: Prisma.SignalWhereInput = {
    scrapedAt: { gte: dateThreshold },
    ...(companyId ? { companyId } : {}),
  };

  const signals = await prisma.signal.groupBy({
    by: ["sourceType"],
    where,
    _count: true,
  });

  return signals.map((s) => ({
    sourceType: s.sourceType,
    count: s._count,
  }));
}
