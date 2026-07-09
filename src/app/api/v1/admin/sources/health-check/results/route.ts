import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET() {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/sources/health-check/results" });

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

    // Find sources checked in the last hour
    const recentThreshold = new Date(Date.now() - 60 * 60 * 1000);

    const recentlyChecked = await prisma.companyDataSource.findMany({
      where: {
        lastCheckedAt: { gte: recentThreshold },
      },
      select: {
        id: true,
        url: true,
        sourceType: true,
        isActive: true,
        lastCheckedAt: true,
        lastSuccessAt: true,
        httpStatusCode: true,
        failureReason: true,
        consecutiveFailures: true,
        company: {
          select: { name: true },
        },
      },
      orderBy: { lastCheckedAt: "desc" },
    });

    const succeeded = recentlyChecked.filter(
      (s) => s.isActive && s.httpStatusCode !== null && s.httpStatusCode >= 200 && s.httpStatusCode < 400
    );
    const failed = recentlyChecked.filter(
      (s) => !s.isActive || s.httpStatusCode === null || s.httpStatusCode >= 400
    );

    return NextResponse.json({
      checked: recentlyChecked.length,
      succeeded: succeeded.length,
      failed: failed.length,
      sources: recentlyChecked.map((s) => ({
        id: s.id,
        url: s.url,
        sourceType: s.sourceType,
        companyName: s.company.name,
        isActive: s.isActive,
        lastCheckedAt: s.lastCheckedAt,
        httpStatusCode: s.httpStatusCode,
        failureReason: s.failureReason,
        consecutiveFailures: s.consecutiveFailures,
        status:
          s.isActive && s.httpStatusCode !== null && s.httpStatusCode < 400
            ? "healthy"
            : "failed",
      })),
    });
  } catch (error) {
    log.error("admin.sources.health_results.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch health check results" },
      { status: 500 }
    );
  }
}
