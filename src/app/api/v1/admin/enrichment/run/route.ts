import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({
    requestId,
    route: "POST /api/v1/admin/enrichment/run",
  });

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

    const body = await request.json().catch(() => ({}));
    const { companyId } = body;

    log.info("admin.enrichment.trigger.async.start", { companyId });

    const { inngest } = await import("@/lib/inngest/client");

    const jobId = crypto.randomUUID();

    try {
      // If companyId is provided, enrich just that company
      // Otherwise, enrich all companies
      if (companyId) {
        await inngest.send({
          name: "company/enrichment.requested",
          data: {
            jobId,
            companyId,
            triggeredBy: session.user.id,
            triggeredAt: new Date().toISOString(),
          },
        });

        log.info("admin.enrichment.trigger.async.success", { jobId, companyId });

        return NextResponse.json({
          success: true,
          jobId,
          companyId,
          mode: "async",
          message: "Enrichment pipeline triggered successfully.",
        });
      } else {
        // Fetch all companies and send enrichment events for each
        const companies = await prisma.company.findMany({
          select: { id: true, name: true },
        });

        log.info("admin.enrichment.trigger.batch.start", {
          companyCount: companies.length,
        });

        const events = companies.map((company) => ({
          name: "company/enrichment.requested" as const,
          data: {
            jobId: `${jobId}-${company.id}`,
            companyId: company.id,
            triggeredBy: session.user.id,
            triggeredAt: new Date().toISOString(),
          },
        }));

        if (events.length > 0) {
          await inngest.send(events);
        }

        log.info("admin.enrichment.trigger.batch.success", {
          jobId,
          companyCount: companies.length,
        });

        return NextResponse.json({
          success: true,
          jobId,
          companyCount: companies.length,
          mode: "async",
          message: `Enrichment pipeline triggered for ${companies.length} companies.`,
        });
      }
    } catch (err) {
      log.error("admin.enrichment.trigger.inngest_failed", { error: String(err) });
      return NextResponse.json(
        {
          error: "queue_failed",
          message: "Failed to queue enrichment job. Ensure Inngest is configured.",
          details: String(err),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    log.error("admin.enrichment.trigger.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to trigger enrichment" },
      { status: 500 }
    );
  }
}
