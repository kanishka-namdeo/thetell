import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const log = logger.child({ requestId: crypto.randomUUID(), route: "GET /api/v1/inferences/[id]" });

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    log.info("api.request.start", { method: "GET", path: `/api/v1/inferences/${id}` });

    const inference = await prisma.inference.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, ticker: true, slug: true } },
        theme: { select: { id: true, label: true, description: true, status: true, momentum: true } },
        calibrations: {
          select: {
            id: true,
            prediction: true,
            predictedAt: true,
            resolvedAt: true,
            wasCorrect: true,
            sourceReliability: true,
            notes: true,
          },
          orderBy: { predictedAt: "desc" },
        },
        debate: true,
      },
    });

    if (!inference) {
      return NextResponse.json(
        { error: "not_found", message: `Inference ${id} not found` },
        { status: 404 },
      );
    }

    const supportingIds = Array.isArray(inference.supportingSignalIds)
      ? (inference.supportingSignalIds as string[])
      : [];
    const contradictingIds = Array.isArray(inference.contradictingSignalIds)
      ? (inference.contradictingSignalIds as string[])
      : [];
    const allSignalIds = [...new Set([...supportingIds, ...contradictingIds])];

    const signals =
      allSignalIds.length > 0
        ? await prisma.signal.findMany({
            where: { id: { in: allSignalIds } },
            select: {
              id: true,
              title: true,
              sourceType: true,
              sourceUrl: true,
              scrapedAt: true,
              company: { select: { id: true, name: true } },
            },
            orderBy: { scrapedAt: "desc" },
          })
        : [];

    log.info("api.request.success", {
      inferenceId: id,
      supportingSignals: supportingIds.length,
      contradictingSignals: contradictingIds.length,
    });

    return NextResponse.json({
      ...inference,
      signals: signals.map((s) => ({
        ...s,
        isSupporting: supportingIds.includes(s.id),
        isContradicting: contradictingIds.includes(s.id),
      })),
    });
  } catch (error) {
    log.error("api.request.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch inference" },
      { status: 500 },
    );
  }
}
