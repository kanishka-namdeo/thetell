import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit-logger";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    log.info("deepagent.templates.delete.start", { method: "DELETE", path: req.url });

    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.deepAgentTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    await prisma.deepAgentTemplate.delete({
      where: { id },
    });

    await logAuditEvent({
      userId: session.user.id,
      action: "deepagent.template.deleted",
      resource: "DeepAgentTemplate",
      resourceId: id,
      details: { name: existing.name },
      request: req,
    });

    log.info("deepagent.templates.delete.success", { templateId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("deepagent.templates.delete.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
