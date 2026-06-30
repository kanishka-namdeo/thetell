import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    log.info("deepagent.message.delete.start", { method: "DELETE", path: req.url });

    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id, messageId } = await params;
    const userId = session.user.id;

    const deepAgentSession = await prisma.deepAgentSession.findUnique({
      where: { id },
    });

    if (!deepAgentSession) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (deepAgentSession.userId !== userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const message = await prisma.deepAgentMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || message.sessionId !== id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    await prisma.deepAgentMessage.delete({
      where: { id: messageId },
    });

    log.info("deepagent.message.delete.success", { sessionId: id, messageId });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("deepagent.message.delete.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
