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
  const analyses = await prisma.analysis.findMany({
    where,
    select: {
      sentiment: true,
      analyzedAt: true,
    },
    orderBy: { analyzedAt: "asc" },
    take: 10000,
  });

  const trends: { date: string; positive: number; negative: number; neutral: number }[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    const dateStr = date.toISOString().split("T")[0];

    const dayAnalyses = analyses.filter((a) => {
      const analysisDate = a.analyzedAt.toISOString().split("T")[0];
      return analysisDate === dateStr;
    });

    trends.push({
      date: dateStr,
      positive: dayAnalyses.filter((a) => a.sentiment === "POSITIVE").length,
      negative: dayAnalyses.filter((a) => a.sentiment === "NEGATIVE").length,
      neutral: dayAnalyses.filter((a) => a.sentiment === "NEUTRAL").length,
    });
  }

  return trends;
}

async function getConfidenceDistribution(where: Prisma.AnalysisWhereInput) {
  const analyses = await prisma.analysis.findMany({
    where,
    select: { confidence: true },
    take: 10000,
  });

  const buckets = {
    high: 0,
    medium: 0,
    low: 0,
  };

  analyses.forEach((a) => {
    if (a.confidence >= 0.8) buckets.high++;
    else if (a.confidence >= 0.5) buckets.medium++;
    else buckets.low++;
  });

  return [
    { bucket: "High (80-100%)", count: buckets.high },
    { bucket: "Medium (50-80%)", count: buckets.medium },
    { bucket: "Low (0-50%)", count: buckets.low },
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
