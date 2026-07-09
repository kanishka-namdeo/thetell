import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const log = logger.child({
    requestId,
    route: "POST /api/v1/admin/discovery/run",
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

    const url = new URL(request.url);
    const scrapeOnly = url.searchParams.get("scrapeOnly") === "true";

    log.info("admin.discovery.trigger.async.start", { scrapeOnly });

    const { inngest } = await import("@/lib/inngest/client");

    const jobId = crypto.randomUUID();

    try {
      await inngest.send({
        name: "signal/discovery.requested",
        data: {
          jobId,
          triggeredBy: session.user.id,
          triggeredAt: new Date().toISOString(),
          companyIds: "all",
          mode: "manual",
          hypothesisAware: false,
          stealthFallback: false,
          scrapeOnly,
        },
      });

      log.info("admin.discovery.trigger.async.success", { jobId });

      return NextResponse.json({
        success: true,
        jobId,
        mode: "async",
        message: "Discovery pipeline triggered successfully.",
      });
    } catch (err) {
      log.error("admin.discovery.trigger.inngest_failed", { error: String(err) });
      return NextResponse.json(
        {
          error: "queue_failed",
          message: "Failed to queue discovery job. Ensure Inngest is configured.",
          details: String(err),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    log.error("admin.discovery.trigger.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to trigger discovery" },
      { status: 500 }
    );
  }
}
