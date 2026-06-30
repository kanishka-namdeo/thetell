import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: `GET /api/v1/admin/pipelines/sessions/${id}` });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const discoverySession = await prisma.pipelineDiscoverySession.findFirst({
      where: {
        OR: [{ id }, { sessionId: id }],
      },
      include: {
        user: { select: { name: true, email: true } },
        discoveredSources: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!discoverySession) {
      return NextResponse.json(
        { error: "not_found", message: "Session not found" },
        { status: 404 }
      );
    }

    const events = Array.isArray(discoverySession.eventLog)
      ? (discoverySession.eventLog as Array<Record<string, unknown>>)
      : [];

    log.info("admin.pipelines.sessions.detail.success", { id });

    return NextResponse.json({
      session: {
        id: discoverySession.id,
        sessionId: discoverySession.sessionId,
        companyName: discoverySession.companyName,
        companyId: discoverySession.companyId,
        status: discoverySession.status,
        startedAt: discoverySession.startedAt.toISOString(),
        completedAt: discoverySession.completedAt?.toISOString() ?? null,
        error: discoverySession.error,
        user: discoverySession.user,
      },
      events,
      discoveredSources: discoverySession.discoveredSources.map((s) => ({
        id: s.id,
        url: s.url,
        sourceType: s.sourceType,
        label: s.label,
        priority: s.priority,
        verified: s.verified,
        verificationDetails: s.verificationDetails,
        createdAt: s.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    log.error("admin.pipelines.sessions.detail.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch session" },
      { status: 500 }
    );
  }
}
