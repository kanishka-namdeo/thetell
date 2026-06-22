import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { logAuditEvent } from "@/lib/audit-logger";
import { z } from "zod";

const UpdateSignalSchema = z.object({
  title: z.string().optional(),
  rawContent: z.string().optional(),
  status: z.enum(["PENDING", "ANALYZING", "ANALYZED", "FAILED", "LOW_QUALITY", "NON_ENGLISH", "REJECTED"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "PATCH /api/v1/admin/content/signals/[id]" });

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
    const parseResult = UpdateSignalSchema.safeParse(body);

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

    log.info("admin.content.signal.update.start", { signalId: id });

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
      data: parseResult.data,
    });

    await logAuditEvent({
      userId: session.user.id,
      action: "content.signal.update",
      resource: "signal",
      resourceId: id,
      details: { changes: parseResult.data },
      request,
    });

    log.info("admin.content.signal.update.success", { signalId: id });

    return NextResponse.json(updatedSignal);
  } catch (error) {
    log.error("admin.content.signal.update.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to update signal" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "DELETE /api/v1/admin/content/signals/[id]" });

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

    log.info("admin.content.signal.delete.start", { signalId: id });

    const signal = await prisma.signal.findUnique({
      where: { id },
    });

    if (!signal) {
      return NextResponse.json(
        { error: "not_found", message: "Signal not found" },
        { status: 404 }
      );
    }

    await prisma.signal.delete({
      where: { id },
    });

    await logAuditEvent({
      userId: session.user.id,
      action: "content.signal.delete",
      resource: "signal",
      resourceId: id,
      details: { title: signal.title },
      request,
    });

    log.info("admin.content.signal.delete.success", { signalId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("admin.content.signal.delete.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to delete signal" },
      { status: 500 }
    );
  }
}
