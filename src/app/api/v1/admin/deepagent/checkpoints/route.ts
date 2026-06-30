import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCheckpointer } from "@/lib/deepagent/init";

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    log.info("deepagent.checkpoints.start", { method: "GET", path: req.url });

    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId parameter" },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    const deepAgentSession = await prisma.deepAgentSession.findUnique({
      where: { id: sessionId },
    });

    if (!deepAgentSession) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (deepAgentSession.userId !== userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const checkpointer = getCheckpointer();

    interface CheckpointEntry {
      checkpoint_id: string;
      timestamp: string;
      message_count: number;
      metadata: Record<string, unknown>;
    }

    const checkpoints: CheckpointEntry[] = [];

    try {
      const tuples = checkpointer.list(
        { configurable: { thread_id: sessionId } },
        { limit: 50 }
      );

      for await (const tuple of tuples) {
        const channelValues = tuple.checkpoint.channel_values;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const messages = (channelValues as Record<string, any>)?.messages;
        const messageCount = Array.isArray(messages) ? messages.length : 0;

        checkpoints.push({
          checkpoint_id: tuple.checkpoint.id,
          timestamp: tuple.checkpoint.ts,
          message_count: messageCount,
          metadata: (tuple.metadata as Record<string, unknown>) ?? {},
        });
      }
    } catch (checkpointError) {
      log.warn("deepagent.checkpoints.list_error", {
        error: String(checkpointError),
        sessionId,
      });
    }

    checkpoints.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    log.info("deepagent.checkpoints.success", {
      sessionId,
      count: checkpoints.length,
    });

    return NextResponse.json({ data: checkpoints });
  } catch (error) {
    log.error("deepagent.checkpoints.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
