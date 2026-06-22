import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { SCRAPER_REGISTRY } from "@/lib/scraping/pipeline-registry";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const requestId = crypto.randomUUID();
  const log = logger.child({
    requestId,
    route: `POST /api/v1/admin/pipelines/${companyId}/run`,
  });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    log.info("admin.pipelines.run.start", { companyId });

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      return NextResponse.json(
        { error: "not_found", message: "Company not found" },
        { status: 404 }
      );
    }

    // Parse optional scraper list from body
    let scrapers: string[] | undefined;
    try {
      const body = await req.json();
      if (body.scrapers && Array.isArray(body.scrapers)) {
        scrapers = body.scrapers.filter((s: string) =>
          SCRAPER_REGISTRY.some((r) => r.name === s)
        );
      }
    } catch {
      // No body or invalid JSON — run all scrapers
    }

    const scraperNames = scrapers ?? SCRAPER_REGISTRY.map((s) => s.name);

    // Send Inngest event to trigger company-scoped discovery
    await inngest.send({
      name: "company/discovery.requested",
      data: {
        companyId,
        scrapers: scraperNames,
      },
    });

    log.info("admin.pipelines.run.queued", {
      companyId,
      companyName: company.name,
      scrapers: scraperNames,
    });

    return NextResponse.json({
      success: true,
      message: "Pipeline run queued",
      companyId,
      scrapers: scraperNames,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error("admin.pipelines.run.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to start pipeline run" },
      { status: 500 }
    );
  }
}
