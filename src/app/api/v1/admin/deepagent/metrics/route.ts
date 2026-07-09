import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

// Model pricing per 1K tokens (USD)
const MODEL_PRICING: Record<string, { prompt: number; completion: number }> = {
  "gpt-4": { prompt: 0.03, completion: 0.06 },
  "gpt-4-turbo": { prompt: 0.01, completion: 0.03 },
  "gpt-3.5": { prompt: 0.0015, completion: 0.002 },
  "gpt-3.5-turbo": { prompt: 0.0015, completion: 0.002 },
  "claude": { prompt: 0.008, completion: 0.024 },
  "claude-3": { prompt: 0.008, completion: 0.024 },
  "claude-3-5-sonnet": { prompt: 0.003, completion: 0.015 },
  "claude-3-opus": { prompt: 0.015, completion: 0.075 },
  "qwen": { prompt: 0.002, completion: 0.006 },
  "minimax": { prompt: 0.002, completion: 0.006 },
};

const DEFAULT_PRICING = { prompt: 0.01, completion: 0.03 };

interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
}

interface ToolCall {
  id: string;
  name: string;
  status: string;
  duration?: number;
}

interface DailyMetric {
  date: string;
  tokens: number;
  cost: number;
}

function getPricing(model: string | null): { prompt: number; completion: number } {
  if (!model) return DEFAULT_PRICING;
  const modelLower = model.toLowerCase();
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (modelLower.includes(key)) return pricing;
  }
  return DEFAULT_PRICING;
}

function calculateCost(
  promptTokens: number,
  completionTokens: number,
  model: string | null
): number {
  const pricing = getPricing(model);
  return (promptTokens / 1000) * pricing.prompt + (completionTokens / 1000) * pricing.completion;
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
    const days = parseInt(searchParams.get("days") || "7", 10);

    if (isNaN(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { error: "invalid_days", message: "days must be between 1 and 365" },
        { status: 400 }
      );
    }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    // Build where clause
    const sessionWhere = sessionId
      ? { id: sessionId }
      : { createdAt: { gte: sinceDate } };

    const messageWhere = sessionId
      ? { sessionId }
      : { session: { createdAt: { gte: sinceDate } } };

    // Fetch sessions and messages in parallel
    const [sessions, messages] = await Promise.all([
      prisma.deepAgentSession.findMany({
        where: sessionWhere,
        select: {
          id: true,
          status: true,
          model: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.deepAgentMessage.findMany({
        where: messageWhere,
        select: {
          sessionId: true,
          role: true,
          tokenUsage: true,
          toolCalls: true,
          timestamp: true,
          session: {
            select: { model: true },
          },
        },
      }),
    ]);

    // Aggregate token usage
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    const dailyMap = new Map<string, DailyMetric>();
    const byModelMap = new Map<string, number>();

    for (const msg of messages) {
      const tokenData = msg.tokenUsage as TokenUsage | null;
      if (!tokenData) continue;

      const prompt = tokenData.inputTokens || 0;
      const completion = tokenData.outputTokens || 0;
      const msgTotal = tokenData.totalTokens || (prompt + completion);

      totalPromptTokens += prompt;
      totalCompletionTokens += completion;
      totalTokens += msgTotal;

      // Daily aggregation
      const dateKey = msg.timestamp.toISOString().split("T")[0];
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, { date: dateKey, tokens: 0, cost: 0 });
      }
      const daily = dailyMap.get(dateKey)!;
      daily.tokens += msgTotal;

      // Model breakdown
      const model = msg.session.model || "unknown";
      byModelMap.set(model, (byModelMap.get(model) || 0) + msgTotal);

      // Cost calculation
      daily.cost += calculateCost(prompt, completion, msg.session.model);
    }

    // Aggregate tool calls
    let totalToolCalls = 0;
    let successfulToolCalls = 0;
    let failedToolCalls = 0;
    const byToolMap = new Map<string, { count: number; success: number; failed: number }>();

    for (const msg of messages) {
      const tools = msg.toolCalls as ToolCall[] | null;
      if (!tools || !Array.isArray(tools)) continue;

      for (const tool of tools) {
        totalToolCalls++;
        const isSuccess = tool.status === "success" || tool.status === "completed";
        if (isSuccess) {
          successfulToolCalls++;
        } else {
          failedToolCalls++;
        }

        if (!byToolMap.has(tool.name)) {
          byToolMap.set(tool.name, { count: 0, success: 0, failed: 0 });
        }
        const toolStats = byToolMap.get(tool.name)!;
        toolStats.count++;
        if (isSuccess) {
          toolStats.success++;
        } else {
          toolStats.failed++;
        }
      }
    }

    // Session statistics
    const sessionStatusMap = new Map<string, number>();
    let totalDurationMs = 0;
    let completedSessions = 0;

    for (const sess of sessions) {
      sessionStatusMap.set(sess.status, (sessionStatusMap.get(sess.status) || 0) + 1);

      if (sess.status === "completed" || sess.status === "failed") {
        const duration = sess.updatedAt.getTime() - sess.createdAt.getTime();
        totalDurationMs += duration;
        completedSessions++;
      }
    }

    const avgDurationMs = completedSessions > 0 ? totalDurationMs / completedSessions : 0;
    const activeSessions = sessions.filter((s) => s.status === "running").length;

    // Calculate total cost
    let totalCost = 0;
    for (const daily of dailyMap.values()) {
      totalCost += daily.cost;
    }

    // Format response
    const response = {
      tokenUsage: {
        total: totalTokens,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
        byModel: Object.fromEntries(byModelMap),
      },
      toolCalls: {
        total: totalToolCalls,
        successful: successfulToolCalls,
        failed: failedToolCalls,
        byTool: Object.fromEntries(
          Array.from(byToolMap.entries()).map(([name, stats]) => [
            name,
            {
              count: stats.count,
              successRate: stats.count > 0 ? stats.success / stats.count : 0,
            },
          ])
        ),
      },
      sessions: {
        total: sessions.length,
        active: activeSessions,
        avgDuration: Math.round(avgDurationMs / 1000), // seconds
        byStatus: Object.fromEntries(sessionStatusMap),
      },
      estimatedCost: {
        total: Math.round(totalCost * 100) / 100,
        daily: Array.from(dailyMap.values())
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((d) => ({ date: d.date, cost: Math.round(d.cost * 100) / 100 })),
      },
    };

    log.info("deepagent.metrics.fetched", {
      sessionId,
      days,
      sessionCount: sessions.length,
      messageCount: messages.length,
    });

    return NextResponse.json(response);
  } catch (error) {
    log.error("deepagent.metrics.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
