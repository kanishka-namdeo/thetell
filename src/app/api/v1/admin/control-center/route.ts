import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get pipeline metrics from database
    const [
      totalSources,
      verifiedSources,
      pendingSources,
      signalsDiscovered24h,
      signalsPending,
      signalsAnalyzed,
      avgConfidence,
      themesDetected,
      companiesEnriched,
      pendingEnrichment,
    ] = await Promise.all([
      // Source metrics
      prisma.companyDataSource.count(),
      prisma.companyDataSource.count({ where: { validatedAt: { not: null } } }),
      prisma.companyDataSource.count({ where: { validatedAt: null } }),
      // Discovery metrics (last 24h)
      prisma.signal.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.signal.count({ where: { status: "PENDING" } }),
      // Analysis metrics
      prisma.signal.count({ where: { status: "ANALYZED" } }),
      prisma.analysis.aggregate({
        _avg: { confidence: true },
      }),
      // Correlation metrics
      prisma.signalTheme.count(),
      // Enrichment metrics (use companyEnrichmentLog to count enriched companies)
      prisma.companyEnrichmentLog
        .findMany({
          distinct: ["companyId"],
          select: { companyId: true },
        })
        .then((logs) => logs.length),
      prisma.company.count(),
    ]);

    const stages = {
      "source-discovery": {
        status: "idle",
        lastRun: null,
        metrics: {
          totalSources,
          pendingSources,
          verifiedSources,
        },
      },
      sources: {
        status: "idle",
        lastRun: null,
        metrics: {
          totalSources,
          healthySources: verifiedSources,
          failedSources: 0, // TODO: track failed health checks
        },
      },
      enrichment: {
        status: "idle",
        lastRun: null,
        metrics: {
          companiesEnriched,
          pendingEnrichment,
        },
      },
      discovery: {
        status: "idle",
        lastRun: null,
        metrics: {
          signalsDiscovered24h,
          signalsPending,
        },
      },
      analysis: {
        status: "idle",
        lastRun: null,
        metrics: {
          signalsAnalyzed,
          signalsPending,
          avgConfidence: avgConfidence._avg.confidence || 0,
        },
      },
      correlation: {
        status: "idle",
        lastRun: null,
        metrics: {
          themesDetected,
          analysesGenerated: signalsAnalyzed,
        },
      },
    };

    return NextResponse.json({ stages });
  } catch (error) {
    console.error("Control center API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pipeline metrics" },
      { status: 500 }
    );
  }
}
