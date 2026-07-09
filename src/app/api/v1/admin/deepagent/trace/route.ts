import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

interface ToolCallData {
  id: string;
  name: string;
  input: unknown;
  output?: unknown;
  status: string;
  duration?: number;
}

interface TokenUsageData {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "missing_param", message: "sessionId is required" },
        { status: 400 }
      );
    }

    const messages = await prisma.deepAgentMessage.findMany({
      where: { sessionId },
      orderBy: { timestamp: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        toolCalls: true,
        tokenUsage: true,
        timestamp: true,
      },
    });

    const trace = messages.map((msg) => {
      const toolCalls = (msg.toolCalls as ToolCallData[] | null) ?? [];
      const tokenUsage = (msg.tokenUsage as TokenUsageData | null) ?? undefined;

      return {
        messageId: msg.id,
        timestamp: msg.timestamp.toISOString(),
        role: msg.role,
        content: msg.content,
        toolCalls: toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          input: tc.input,
          output: tc.output,
          status: tc.status,
          duration: tc.duration,
        })),
        tokenUsage: tokenUsage
          ? {
              inputTokens: tokenUsage.inputTokens ?? 0,
              outputTokens: tokenUsage.outputTokens ?? 0,
              totalTokens:
                tokenUsage.totalTokens ??
                (tokenUsage.inputTokens ?? 0) + (tokenUsage.outputTokens ?? 0),
            }
          : undefined,
      };
    });

    let totalToolCalls = 0;
    let successfulToolCalls = 0;
    let totalTokens = 0;
    let totalDuration = 0;

    for (const entry of trace) {
      totalToolCalls += entry.toolCalls.length;
      for (const tc of entry.toolCalls) {
        if (tc.status === "success" || tc.status === "completed") {
          successfulToolCalls++;
        }
        if (tc.duration) {
          totalDuration += tc.duration;
        }
      }
      if (entry.tokenUsage) {
        totalTokens += entry.tokenUsage.totalTokens;
      }
    }

    const summary = {
      totalMessages: trace.length,
      totalToolCalls,
      totalTokens,
      totalDuration,
      toolCallSuccessRate:
        totalToolCalls > 0 ? successfulToolCalls / totalToolCalls : 0,
    };

    log.info("deepagent.trace.fetched", { sessionId, messageCount: trace.length });

    return NextResponse.json({ trace, summary });
  } catch (error) {
    log.error("deepagent.trace.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch execution trace" },
      { status: 500 }
    );
  }
}
