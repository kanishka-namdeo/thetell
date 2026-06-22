import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: signalId } = await params;
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/signals/[id]/correlations" });

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    log.info("api.request.start", { method: "GET", path: `/api/v1/signals/${signalId}/correlations` });

    const signal = await prisma.signal.findUnique({
      where: { id: signalId },
      select: {
        id: true,
        title: true,
        sourceType: true,
        companyId: true,
        themes: {
          select: { id: true, label: true },
        },
      },
    });

    if (!signal) {
      return NextResponse.json(
        { error: "not_found", message: `Signal ${signalId} not found` },
        { status: 404 },
      );
    }

    const themeIds = signal.themes.map((t) => t.id);

    if (themeIds.length === 0) {
      log.info("api.request.success", { signalId, correlations: 0, reason: "no_themes" });
      return NextResponse.json({
        signal: { id: signal.id, title: signal.title, sourceType: signal.sourceType },
        correlations: [],
      });
    }

    const correlatedSignals = await prisma.signal.findMany({
      where: {
        id: { not: signalId },
        status: "ANALYZED",
        themes: { some: { id: { in: themeIds } } },
      },
      select: {
        id: true,
        title: true,
        sourceType: true,
        sourceUrl: true,
        scrapedAt: true,
        companyId: true,
        company: { select: { id: true, name: true } },
        themes: {
          where: { id: { in: themeIds } },
          select: { id: true, label: true },
        },
      },
      orderBy: { scrapedAt: "desc" },
      take: 50,
    });

    const correlations = correlatedSignals.map((cs) => {
      const overlappingThemeIds = cs.themes.map((t) => t.id);
      const overlapScore = overlappingThemeIds.length / themeIds.length;

      const sourceTypes = new Set([signal.sourceType, cs.sourceType]);

      return {
        id: cs.id,
        title: cs.title,
        sourceType: cs.sourceType,
        sourceUrl: cs.sourceUrl,
        scrapedAt: cs.scrapedAt,
        company: cs.company,
        overlappingThemes: cs.themes,
        overlapScore: Math.round(overlapScore * 100) / 100,
        sourceTypeDiversity: {
          types: Array.from(sourceTypes),
          diverse: sourceTypes.size > 1,
        },
      };
    });

    correlations.sort((a, b) => b.overlapScore - a.overlapScore);

    log.info("api.request.success", {
      signalId,
      themeCount: themeIds.length,
      correlations: correlations.length,
    });

    return NextResponse.json({
      signal: { id: signal.id, title: signal.title, sourceType: signal.sourceType, themes: signal.themes },
      correlations,
    });
  } catch (error) {
    log.error("api.request.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch correlations" },
      { status: 500 },
    );
  }
}
