import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/pipelines/sessions" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);
    const cursor = searchParams.get("cursor");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (status && ["running", "completed", "failed", "cancelled"].includes(status)) {
      where.status = status;
    }

    const sessions = await prisma.pipelineDiscoverySession.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { startedAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { discoveredSources: true } },
      },
    });

    const hasMore = sessions.length > limit;
    const pageSessions = hasMore ? sessions.slice(0, limit) : sessions;
    const nextCursor = hasMore ? pageSessions[pageSessions.length - 1].id : null;

    log.info("admin.pipelines.sessions.list.success", { count: pageSessions.length });

    return NextResponse.json({
      sessions: pageSessions.map((s) => ({
        id: s.id,
        sessionId: s.sessionId,
        companyName: s.companyName,
        companyId: s.companyId,
        status: s.status,
        startedAt: s.startedAt.toISOString(),
        completedAt: s.completedAt?.toISOString() ?? null,
        error: s.error,
        user: s.user,
        sourcesDiscovered: s._count.discoveredSources,
      })),
      nextCursor,
    });
  } catch (error) {
    log.error("admin.pipelines.sessions.list.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}
