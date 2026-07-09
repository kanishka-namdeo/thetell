import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const log = logger.child({
    requestId,
    route: "POST /api/v1/admin/analysis/run",
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

    log.info("admin.analysis.trigger.async.start");

    const { inngest } = await import("@/lib/inngest/client");

    const jobId = crypto.randomUUID();

    // Check if we should only analyze new (PENDING) signals or re-analyze all
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope");
    const onlyNew = scope === "new";

    // Find signals that need analysis
    // scope=new: PENDING signals (new, never analyzed) + stale ANALYZING (>10min)
    // default: PENDING + FAILED + ANALYZED + stale ANALYZING (re-analyze all)
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
    const signalsToAnalyze = await prisma.signal.findMany({
      where: onlyNew
        ? {
            OR: [
              { status: "PENDING" },
              { status: "ANALYZING", updatedAt: { lt: staleThreshold } },
            ],
          }
        : {
            OR: [
              { status: { in: ["PENDING", "FAILED", "ANALYZED"] } },
              { status: "ANALYZING", updatedAt: { lt: staleThreshold } },
            ],
          },
      select: { id: true, status: true },
    });

    if (signalsToAnalyze.length === 0) {
      log.info("admin.analysis.trigger.no_signals_to_analyze");
      return NextResponse.json({
        success: true,
        jobId,
        mode: "async",
        signalsQueued: 0,
        message: "No signals to analyze.",
      });
    }

    try {
      // Send one event per signal with the required signalId field
      await Promise.all(
        signalsToAnalyze.map((signal) =>
          inngest.send({
            name: "signal/analysis.requested",
            data: {
              signalId: signal.id,
              jobId,
              triggeredBy: session.user.id,
              triggeredAt: new Date().toISOString(),
            },
          })
        )
      );

      log.info("admin.analysis.trigger.async.success", {
        jobId,
        signalsQueued: signalsToAnalyze.length,
      });

      return NextResponse.json({
        success: true,
        jobId,
        mode: "async",
        signalsQueued: signalsToAnalyze.length,
        message: `Queued ${signalsToAnalyze.length} signal(s) for analysis.`,
      });
    } catch (err) {
      log.error("admin.analysis.trigger.inngest_failed", { error: String(err) });
      return NextResponse.json(
        {
          error: "queue_failed",
          message: "Failed to queue analysis job. Ensure Inngest is configured.",
          details: String(err),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    log.error("admin.analysis.trigger.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to trigger analysis" },
      { status: 500 }
    );
  }
}
