import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    log.info("deepagent.messages.start", { method: "GET", path: req.url });

    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

    const deepAgentSession = await prisma.deepAgentSession.findUnique({
      where: { id },
    });

    if (!deepAgentSession) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (deepAgentSession.userId !== userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const messages = await prisma.deepAgentMessage.findMany({
      where: { sessionId: id },
      orderBy: { timestamp: "desc" },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    });

    const hasMore = messages.length > limit;
    const paginatedMessages = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? paginatedMessages[paginatedMessages.length - 1].id : null;

    const formattedMessages = paginatedMessages
      .reverse()
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
        fileChanges: m.fileChanges,
        tokenUsage: m.tokenUsage,
        isStreaming: m.isStreaming,
        timestamp: m.timestamp.toISOString(),
      }));

    log.info("deepagent.messages.success", {
      sessionId: id,
      count: formattedMessages.length,
      hasMore,
    });

    return NextResponse.json({
      data: formattedMessages,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    log.error("deepagent.messages.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
