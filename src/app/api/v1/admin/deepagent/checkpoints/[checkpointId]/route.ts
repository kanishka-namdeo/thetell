import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCheckpointer } from "@/lib/deepagent/init";
import { z } from "zod";

const restoreSchema = z.object({
  action: z.enum(["get", "restore", "branch"]),
  newSessionTitle: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ checkpointId: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    log.info("deepagent.checkpoint.action.start", {
      method: "POST",
      path: req.url,
    });

    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { checkpointId } = await params;
    const userId = session.user.id;

    const body = await req.json();
    const parsed = restoreSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { action, newSessionTitle } = parsed.data;
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId parameter" },
        { status: 400 }
      );
    }

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

    let tuple;
    try {
      tuple = await checkpointer.getTuple({
        configurable: { thread_id: sessionId, checkpoint_id: checkpointId },
      });
    } catch (checkpointError) {
      log.error("deepagent.checkpoint.get_error", {
        error: String(checkpointError),
        checkpointId,
      });
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (!tuple) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (action === "get") {
      log.info("deepagent.checkpoint.get.success", { checkpointId, sessionId });

      return NextResponse.json({
        data: {
          checkpoint_id: tuple.checkpoint.id,
          timestamp: tuple.checkpoint.ts,
          channel_values: tuple.checkpoint.channel_values,
          metadata: tuple.metadata,
        },
      });
    }

    if (action === "restore") {
      log.info("deepagent.checkpoint.restore.start", { checkpointId, sessionId });

      await checkpointer.put(
        { configurable: { thread_id: sessionId } },
        tuple.checkpoint,
        {
          source: "update",
          step: -1,
          parents: {},
        },
        {}
      );

      log.info("deepagent.checkpoint.restore.success", { checkpointId, sessionId });

      return NextResponse.json({
        data: {
          success: true,
          message: "Session restored to checkpoint",
          checkpoint_id: checkpointId,
        },
      });
    }

    if (action === "branch") {
      log.info("deepagent.checkpoint.branch.start", { checkpointId, sessionId });

      const newSessionId = crypto.randomUUID();
      const title = newSessionTitle || `Branched from ${deepAgentSession.title}`;

      const newSession = await prisma.deepAgentSession.create({
        data: {
          id: newSessionId,
          userId,
          title,
          status: "idle",
        },
      });

      await checkpointer.put(
        { configurable: { thread_id: newSessionId } },
        tuple.checkpoint,
        {
          source: "fork",
          step: -1,
          parents: {},
        },
        {}
      );

      log.info("deepagent.checkpoint.branch.success", {
        checkpointId,
        fromSessionId: sessionId,
        toSessionId: newSessionId,
      });

      return NextResponse.json(
        {
          data: {
            id: newSession.id,
            title: newSession.title,
            status: newSession.status,
            createdAt: newSession.createdAt.toISOString(),
            updatedAt: newSession.updatedAt.toISOString(),
            branched_from: sessionId,
            checkpoint_id: checkpointId,
          },
        },
        { status: 201 }
      );
    }

    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  } catch (error) {
    log.error("deepagent.checkpoint.action.error", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
