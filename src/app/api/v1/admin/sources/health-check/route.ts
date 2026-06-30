import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { logAuditEvent } from "@/lib/audit-logger";
import { inngest } from "@/lib/inngest/client";

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "POST /api/v1/admin/sources/health-check" });

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

    log.info("admin.sources.health_check.start");

    // Count sources that need checking
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);
    const sourcesToCheck = await prisma.companyDataSource.count({
      where: {
        isActive: true,
        OR: [
          { lastCheckedAt: null },
          { lastCheckedAt: { lt: staleThreshold } },
        ],
      },
    });

    // Trigger the source health background job
    await inngest.send({
      name: "source/health.check",
      data: { triggeredBy: session.user.id, sourcesToCheck },
    });

    await logAuditEvent({
      userId: session.user.id,
      action: "sources.health_check.triggered",
      resource: "source",
      details: { sourcesToCheck },
      request,
    });

    log.info("admin.sources.health_check.triggered", { sourcesToCheck });

    return NextResponse.json({
      triggered: true,
      sourcesToCheck,
    });
  } catch (error) {
    log.error("admin.sources.health_check.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to trigger source health check" },
      { status: 500 }
    );
  }
}
