import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/clusters/[id]" });

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;

    log.info("api.request.start", { method: "GET", path: `/api/v1/clusters/${id}` });

    const theme = await prisma.signalTheme.findUnique({
      where: { id },
      include: {
        company: true,
        clusteredSignals: {
          where: { status: "ANALYZED" },
          orderBy: { scrapedAt: "desc" },
          include: {
            analyses: {
              select: {
                id: true,
                keyFacts: true,
                confidence: true,
                sentiment: true,
                agentPersona: true,
              },
            },
          },
        },
        inferences: {
          orderBy: { confidence: "desc" },
          include: {
            debate: {
              select: {
                id: true,
                consensusReached: true,
                finalConfidence: true,
                status: true,
              },
            },
          },
        },
        clusterArticles: {
          orderBy: { updatedAt: "desc" },
        },
      },
    });

    if (!theme) {
      return NextResponse.json(
        { error: "not_found", message: "Cluster not found" },
        { status: 404 }
      );
    }

    // Build evidence chain from all supporting signals
    const evidenceChain = theme.clusteredSignals.flatMap((signal) => {
      return signal.analyses.map((analysis) => ({
        signalId: signal.id,
        signalTitle: signal.title,
        sourceType: signal.sourceType,
        facts: analysis.keyFacts,
        confidence: analysis.confidence,
      }));
    });

    log.info("api.request.success", {
      themeId: id,
      signalCount: theme.clusteredSignals.length,
      inferenceCount: theme.inferences.length,
    });

    return NextResponse.json({
      theme: {
        ...theme,
        signals: theme.clusteredSignals.map((s) => ({
          ...s,
          analyses: undefined,
        })),
      },
      evidenceChain,
    });
  } catch (error) {
    log.error("api.request.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch cluster" },
      { status: 500 }
    );
  }
}
