import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Sentiment } from "@prisma/client";
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
    const rawLimit = parseInt(searchParams.get("limit") || "20");
    const limit = Number.isNaN(rawLimit) ? 20 : Math.min(Math.max(rawLimit, 1), 100);
    const cursor = searchParams.get("cursor");
    const companyId = searchParams.get("companyId");
    const sentiment = searchParams.get("sentiment") as Sentiment | null;
    const minConfidence = searchParams.get("minConfidence");
    const maxConfidence = searchParams.get("maxConfidence");

    const where: {
      signal?: { companyId: string };
      sentiment?: Sentiment;
      confidence?: { gte?: number; lte?: number };
    } = {};
    if (companyId) where.signal = { companyId };
    if (sentiment) where.sentiment = sentiment;
    if (minConfidence || maxConfidence) {
      where.confidence = {};
      if (minConfidence) where.confidence.gte = parseFloat(minConfidence);
      if (maxConfidence) where.confidence.lte = parseFloat(maxConfidence);
    }

    const analyses = await prisma.analysis.findMany({
      where,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        signal: {
          include: {
            company: true,
          },
        },
      },
      orderBy: { analyzedAt: "desc" },
    });

    const hasMore = analyses.length > limit;
    const items = hasMore ? analyses.slice(0, limit) : analyses;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return NextResponse.json({
      items,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    logger.error("Error fetching analyses", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch analyses" },
      { status: 500 }
    );
  }
}
