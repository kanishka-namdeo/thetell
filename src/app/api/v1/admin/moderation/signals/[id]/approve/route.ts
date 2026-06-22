import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { logAuditEvent } from "@/lib/audit-logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "POST /api/v1/admin/moderation/signals/[id]/approve" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    log.info("admin.moderation.signal.approve.start", { signalId: id });

    const signal = await prisma.signal.findUnique({
      where: { id },
    });

    if (!signal) {
      return NextResponse.json(
        { error: "not_found", message: "Signal not found" },
        { status: 404 }
      );
    }

    const updatedSignal = await prisma.signal.update({
      where: { id },
      data: { status: "ANALYZED" },
    });

    await logAuditEvent({
      userId: session.user.id,
      action: "moderation.signal.approve",
      resource: "signal",
      resourceId: id,
      details: { previousStatus: signal.status, newStatus: "ANALYZED" },
      request,
    });

    log.info("admin.moderation.signal.approve.success", { signalId: id });

    return NextResponse.json(updatedSignal);
  } catch (error) {
    log.error("admin.moderation.signal.approve.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to approve signal" },
      { status: 500 }
    );
  }
}
