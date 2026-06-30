import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit-logger";
import { z } from "zod";

const updateSessionSchema = z.object({
  title: z.string().min(1).max(200),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    log.info("deepagent.session.update.start", { method: "PATCH", path: req.url });

    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    const body = await req.json();
    const parsed = updateSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existingSession = await prisma.deepAgentSession.findUnique({
      where: { id },
    });

    if (!existingSession) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (existingSession.userId !== userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const updatedSession = await prisma.deepAgentSession.update({
      where: { id },
      data: { title: parsed.data.title },
    });

    await logAuditEvent({
      userId,
      action: "deepagent.session.updated",
      resource: "DeepAgentSession",
      resourceId: id,
      details: { title: parsed.data.title },
      request: req,
    });

    log.info("deepagent.session.update.success", { sessionId: id });

    return NextResponse.json({
      data: {
        id: updatedSession.id,
        title: updatedSession.title,
        status: updatedSession.status,
        createdAt: updatedSession.createdAt.toISOString(),
        updatedAt: updatedSession.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    log.error("deepagent.session.update.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    log.info("deepagent.session.delete.start", { method: "DELETE", path: req.url });

    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    const existingSession = await prisma.deepAgentSession.findUnique({
      where: { id },
    });

    if (!existingSession) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (existingSession.userId !== userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    await prisma.deepAgentSession.delete({
      where: { id },
    });

    await logAuditEvent({
      userId,
      action: "deepagent.session.deleted",
      resource: "DeepAgentSession",
      resourceId: id,
      request: req,
    });

    log.info("deepagent.session.delete.success", { sessionId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("deepagent.session.delete.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
