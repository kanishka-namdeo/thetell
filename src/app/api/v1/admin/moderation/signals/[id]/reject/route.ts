import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { logAuditEvent } from "@/lib/audit-logger";
import { z } from "zod";

const RejectSchema = z.object({
  reason: z.string().min(1, "Rejection reason is required"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "POST /api/v1/admin/moderation/signals/[id]/reject" });

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
    const body = await request.json();
    const parseResult = RejectSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Invalid request body",
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { reason } = parseResult.data;

    log.info("admin.moderation.signal.reject.start", { signalId: id, reason });

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
      data: { status: "REJECTED" },
    });

    await logAuditEvent({
      userId: session.user.id,
      action: "moderation.signal.reject",
      resource: "signal",
      resourceId: id,
      details: { previousStatus: signal.status, newStatus: "REJECTED", reason },
      request,
    });

    log.info("admin.moderation.signal.reject.success", { signalId: id });

    return NextResponse.json(updatedSignal);
  } catch (error) {
    log.error("admin.moderation.signal.reject.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to reject signal" },
      { status: 500 }
    );
  }
}
