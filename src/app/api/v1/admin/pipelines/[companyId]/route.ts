import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { SCRAPER_REGISTRY } from "@/lib/scraping/pipeline-registry";

type PipelineStatus = "completed" | "running" | "failed" | "never_run";

function mapStatus(status: string): PipelineStatus {
  if (status === "completed") return "completed";
  if (status === "running") return "running";
  if (status === "failed") return "failed";
  return "never_run";
}

function mapRunStatus(status: string): "completed" | "running" | "failed" {
  if (status === "completed") return "completed";
  if (status === "running") return "running";
  return "failed";
}

function computeDurationMs(startedAt: Date | null, completedAt: Date | null): number {
  if (!startedAt || !completedAt) return 0;
  return new Date(completedAt).getTime() - new Date(startedAt).getTime();
}

function mapLog(log: { id: string; level: string; message: string; createdAt: Date }) {
  return {
    id: log.id,
    timestamp: log.createdAt.toISOString(),
    level: log.level as "info" | "warn" | "error",
    message: log.message,
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const requestId = crypto.randomUUID();
  const log = logger.child({
    requestId,
    route: `GET /api/v1/admin/pipelines/${companyId}`,
  });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    log.info("admin.pipelines.detail.start", { companyId });

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        ticker: true,
        websiteUrl: true,
      },
    });

    if (!company) {
      return NextResponse.json(
        { error: "not_found", message: "Company not found" },
        { status: 404 }
      );
    }

    const totalSignals = await prisma.signal.count({
      where: { companyId },
    });

    // Build pipeline cards for all scrapers
    const pipelines = await Promise.all(
      SCRAPER_REGISTRY.map(async (scraper) => {
        const lastRun = await prisma.pipelineRun.findFirst({
          where: { companyId, scraperName: scraper.name },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            createdAt: true,
            logs: {
              orderBy: { createdAt: "desc" },
              take: 5,
              select: { id: true, level: true, message: true, createdAt: true },
            },
          },
        });

        const signalCount = await prisma.signal.count({
          where: { companyId, sourceType: scraper.sourceType },
        });

        return {
          scraperName: scraper.name,
          displayName: scraper.displayName,
          sourceType: scraper.sourceType,
          platformName: scraper.platformName,
          status: lastRun ? mapStatus(lastRun.status) : "never_run" as PipelineStatus,
          totalSignals: signalCount,
          lastRunAt: lastRun?.createdAt?.toISOString() ?? null,
          logs: lastRun?.logs?.map(mapLog) ?? [],
        };
      })
    );

    // Recent runs with logs
    const rawRuns = await prisma.pipelineRun.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        scraperName: true,
        status: true,
        signalsCreated: true,
        duplicatesSkipped: true,
        startedAt: true,
        completedAt: true,
        error: true,
        logs: {
          orderBy: { createdAt: "asc" },
          select: { id: true, level: true, message: true, createdAt: true },
        },
      },
    });

    const recentRuns = rawRuns.map((run) => ({
      id: run.id,
      scraperName: run.scraperName,
      status: mapRunStatus(run.status),
      signalsCreated: run.signalsCreated,
      duplicatesSkipped: run.duplicatesSkipped,
      durationMs: computeDurationMs(run.startedAt, run.completedAt),
      startedAt: run.startedAt?.toISOString() ?? "",
      completedAt: run.completedAt?.toISOString() ?? null,
      logs: run.logs.map(mapLog),
    }));

    log.info("admin.pipelines.detail.success", {
      companyId,
      pipelinesCount: pipelines.length,
    });

    return NextResponse.json({
      id: company.id,
      name: company.name,
      ticker: company.ticker,
      website: company.websiteUrl,
      totalSignals,
      pipelines,
      recentRuns,
    });
  } catch (error) {
    log.error("admin.pipelines.detail.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch pipeline details" },
      { status: 500 }
    );
  }
}
