import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit-logger";
import { z } from "zod";

const createSessionSchema = z.object({
  title: z.string().optional().default("New Chat"),
  model: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    log.info("deepagent.chat.start", { method: "POST", path: req.url });

    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    const { title, model } = parsed.data;

    const deepAgentSession = await prisma.deepAgentSession.create({
      data: {
        userId,
        title,
        model,
        status: "idle",
      },
    });

    await logAuditEvent({
      userId,
      action: "deepagent.session.created",
      resource: "DeepAgentSession",
      resourceId: deepAgentSession.id,
      details: { title },
      request: req,
    });

    log.info("deepagent.chat.success", { sessionId: deepAgentSession.id });

    return NextResponse.json(
      {
        data: {
          id: deepAgentSession.id,
          title: deepAgentSession.title,
          model: deepAgentSession.model,
          status: deepAgentSession.status,
          createdAt: deepAgentSession.createdAt.toISOString(),
          updatedAt: deepAgentSession.updatedAt.toISOString(),
          messageCount: 0,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    log.error("deepagent.chat.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    log.info("deepagent.sessions.start", { method: "GET", path: req.url });

    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const sessions = await prisma.deepAgentSession.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });

    const formattedSessions = sessions.map((s) => ({
      id: s.id,
      title: s.title,
      model: s.model,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      messageCount: s._count.messages,
    }));

    log.info("deepagent.sessions.success", { count: formattedSessions.length });

    return NextResponse.json({ data: formattedSessions });
  } catch (error) {
    log.error("deepagent.sessions.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
