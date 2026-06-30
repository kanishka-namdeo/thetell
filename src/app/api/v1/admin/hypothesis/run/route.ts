import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";

export async function POST() {
  const requestId = crypto.randomUUID();
  const log = logger.child({
    requestId,
    route: "POST /api/v1/admin/hypothesis/run",
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

    log.info("admin.hypothesis.trigger.start");

    const { inngest } = await import("@/lib/inngest/client");

    const jobId = crypto.randomUUID();

    try {
      await inngest.send({
        name: "hypothesis/generate",
        data: {
          jobId,
          triggeredBy: session.user.id,
          triggeredAt: new Date().toISOString(),
        },
      });

      log.info("admin.hypothesis.trigger.success", { jobId });

      return NextResponse.json({
        success: true,
        jobId,
        mode: "async",
        message:
          "Hypothesis generation triggered. This may take several minutes depending on company count.",
      });
    } catch (err) {
      log.error("admin.hypothesis.trigger.inngest_failed", {
        error: String(err),
      });
      return NextResponse.json(
        {
          error: "queue_failed",
          message:
            "Failed to queue hypothesis job. Ensure Inngest is configured.",
          details: String(err),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    log.error("admin.hypothesis.trigger.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to trigger hypothesis generation" },
      { status: 500 }
    );
  }
}
