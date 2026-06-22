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

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/pipelines" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    log.info("admin.pipelines.list.start");

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);
    const cursor = searchParams.get("cursor");

    const companies = await prisma.company.findMany({
      where: search
        ? { name: { contains: search, mode: "insensitive" } }
        : undefined,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        ticker: true,
        websiteUrl: true,
      },
    });

    const hasMore = companies.length > limit;
    const pageCompanies = hasMore ? companies.slice(0, limit) : companies;
    const nextCursor = hasMore ? pageCompanies[pageCompanies.length - 1].id : null;

    const companyResults = await Promise.all(
      pageCompanies.map(async (company) => {
        const [allRuns, signalCounts, totalSignals] = await Promise.all([
          prisma.pipelineRun.findMany({
            where: { companyId: company.id },
            orderBy: { createdAt: "desc" },
            select: {
              scraperName: true,
              sourceType: true,
              status: true,
              signalsCreated: true,
              createdAt: true,
            },
          }),
          prisma.signal.groupBy({
            by: ["sourceType"],
            where: { companyId: company.id },
            _count: true,
          }),
          prisma.signal.count({
            where: { companyId: company.id },
          }),
        ]);

        // Group runs by scraperName, keep only the latest per scraper
        const runsByScraper = new Map<string, (typeof allRuns)[0]>();
        for (const run of allRuns) {
          if (!runsByScraper.has(run.scraperName)) {
            runsByScraper.set(run.scraperName, run);
          }
        }

        // Count total signals per sourceType
        const totalSignalsByType = new Map<string, number>();
        for (const sc of signalCounts) {
          totalSignalsByType.set(sc.sourceType, sc._count);
        }

        // Return ALL scrapers from registry, not just ones with runs
        const pipelines = SCRAPER_REGISTRY.map((scraper) => {
          const run = runsByScraper.get(scraper.name);
          return {
            scraperName: scraper.name,
            sourceType: scraper.sourceType,
            status: run ? mapStatus(run.status) : "never_run" as PipelineStatus,
            lastRunAt: run?.createdAt?.toISOString() ?? null,
            signalsCount: totalSignalsByType.get(scraper.sourceType) ?? 0,
          };
        });

        const lastActivityAt =
          allRuns.length > 0 ? allRuns[0].createdAt.toISOString() : null;

        return {
          id: company.id,
          name: company.name,
          ticker: company.ticker,
          website: company.websiteUrl,
          totalSignals,
          lastActivityAt,
          pipelines,
        };
      })
    );

    log.info("admin.pipelines.list.success", {
      count: companyResults.length,
    });

    return NextResponse.json({
      companies: companyResults,
      nextCursor,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error("admin.pipelines.list.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch pipelines" },
      { status: 500 }
    );
  }
}
