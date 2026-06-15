import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SourceType, SignalStatus, Sentiment } from "@prisma/client";

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
    const limit = parseInt(searchParams.get("limit") || "20");
    const cursor = searchParams.get("cursor");
    const companyId = searchParams.get("companyId");
    const sourceType = searchParams.get("sourceType") as SourceType | null;
    const status = searchParams.get("status") as SignalStatus | null;
    const sentiment = searchParams.get("sentiment") as Sentiment | null;

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (sourceType) where.sourceType = sourceType;
    if (status) where.status = status;
    if (sentiment) where.analysis = { sentiment };

    const signals = await prisma.signal.findMany({
      where,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        company: true,
        analysis: true,
      },
      orderBy: { scrapedAt: "desc" },
    });

    const hasMore = signals.length > limit;
    const items = hasMore ? signals.slice(0, limit) : signals;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return NextResponse.json({
      items,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error("Error fetching signals:", error);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch signals" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { sourceUrl, sourceType, title, rawContent, publishedAt, companyId } = body;

    if (!sourceUrl || !sourceType || !title || !rawContent || !companyId) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Missing required fields",
          details: {
            sourceUrl: !sourceUrl ? ["Required"] : undefined,
            sourceType: !sourceType ? ["Required"] : undefined,
            title: !title ? ["Required"] : undefined,
            rawContent: !rawContent ? ["Required"] : undefined,
            companyId: !companyId ? ["Required"] : undefined,
          },
        },
        { status: 400 }
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json(
        { error: "not_found", message: "Company not found" },
        { status: 404 }
      );
    }

    const signal = await prisma.signal.create({
      data: {
        sourceUrl,
        sourceType,
        title,
        rawContent,
        publishedAt: publishedAt ? new Date(publishedAt) : null,
        companyId,
        status: "PENDING",
      },
    });

    // Trigger backend analysis asynchronously
    try {
      const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
      const apiKey = process.env.BACKEND_API_KEY;

      if (apiKey) {
        fetch(`${backendUrl}/api/v1/signals/${signal.id}/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
        }).catch((err) => {
          console.error("Failed to trigger backend analysis:", err);
        });
      }
    } catch (err) {
      // Don't fail the request if backend trigger fails
      console.error("Error triggering backend analysis:", err);
    }

    return NextResponse.json(signal, { status: 201 });
  } catch (error) {
    console.error("Error creating signal:", error);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to create signal" },
      { status: 500 }
    );
  }
}
