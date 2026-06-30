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
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
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

    const companyIds = pageCompanies.map((c) => c.id);

    const [allRuns, signalCounts, signalCountsByCompany] = await Promise.all([
      prisma.pipelineRun.findMany({
        where: { companyId: { in: companyIds } },
        orderBy: { createdAt: "desc" },
        select: {
          companyId: true,
          scraperName: true,
          sourceType: true,
          status: true,
          signalsCreated: true,
          createdAt: true,
        },
      }),
      prisma.signal.groupBy({
        by: ["companyId", "sourceType"],
        where: { companyId: { in: companyIds } },
        _count: true,
      }),
      prisma.signal.groupBy({
        by: ["companyId"],
        where: { companyId: { in: companyIds } },
        _count: { id: true },
      }),
    ]);

    const runsByCompany = new Map<string, (typeof allRuns)[0][]>();
    for (const run of allRuns) {
      if (!runsByCompany.has(run.companyId)) {
        runsByCompany.set(run.companyId, []);
      }
      runsByCompany.get(run.companyId)!.push(run);
    }

    const signalsByCompanyAndType = new Map<string, Map<string, number>>();
    for (const sc of signalCounts) {
      if (!signalsByCompanyAndType.has(sc.companyId)) {
        signalsByCompanyAndType.set(sc.companyId, new Map());
      }
      signalsByCompanyAndType.get(sc.companyId)!.set(sc.sourceType, sc._count);
    }

    const totalSignalsByCompany = new Map<string, number>();
    for (const sc of signalCountsByCompany) {
      totalSignalsByCompany.set(sc.companyId, sc._count.id);
    }

    const companyResults = pageCompanies.map((company) => {
      const companyRuns = runsByCompany.get(company.id) || [];
      const typeMap = signalsByCompanyAndType.get(company.id) || new Map();
      const totalSignals = totalSignalsByCompany.get(company.id) || 0;

      const runsByScraper = new Map<string, (typeof allRuns)[0]>();
      for (const run of companyRuns) {
        if (!runsByScraper.has(run.scraperName)) {
          runsByScraper.set(run.scraperName, run);
        }
      }

      const pipelines = SCRAPER_REGISTRY.map((scraper) => {
        const run = runsByScraper.get(scraper.name);
        return {
          scraperName: scraper.name,
          sourceType: scraper.sourceType,
          status: run ? mapStatus(run.status) : "never_run" as PipelineStatus,
          lastRunAt: run?.createdAt?.toISOString() ?? null,
          signalsCount: typeMap.get(scraper.sourceType) ?? 0,
        };
      });

      const lastActivityAt =
        companyRuns.length > 0 ? companyRuns[0].createdAt.toISOString() : null;

      return {
        id: company.id,
        name: company.name,
        ticker: company.ticker,
        website: company.websiteUrl,
        totalSignals,
        lastActivityAt,
        pipelines,
      };
    });

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
