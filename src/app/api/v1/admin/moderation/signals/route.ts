import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { z } from "zod";

const QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
  status: z.string().optional(),
  sourceType: z.string().optional(),
  confidence: z.coerce.number().min(0).max(1).optional(),
  sentiment: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]).optional(),
  clusterId: z.string().optional(),
  sortBy: z.enum(["scrapedAt", "confidence", "createdAt"]).default("scrapedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/moderation/signals" });

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = QuerySchema.parse(Object.fromEntries(searchParams));

    log.info("admin.moderation.signals.list.start", { query });

    const where: Record<string, unknown> = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.sourceType) {
      where.sourceType = query.sourceType;
    }

    if (query.confidence !== undefined || query.sentiment) {
      const analysesWhere: Record<string, unknown> = {};
      if (query.confidence !== undefined) {
        analysesWhere.confidence = { gte: query.confidence };
      }
      if (query.sentiment) {
        analysesWhere.sentiment = query.sentiment;
      }
      where.analyses = { some: analysesWhere };
    }

    if (query.clusterId) {
      where.clusterId = query.clusterId;
    }

    const orderBy: Record<string, string> = {
      [query.sortBy]: query.sortOrder,
    };

    const signals = await prisma.signal.findMany({
      where,
      take: query.limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      include: {
        company: true,
        analyses: true,
        cluster: {
          select: { id: true, label: true, status: true },
        },
      },
      orderBy,
    });

    const total = await prisma.signal.count({ where });

    const hasMore = signals.length > query.limit;
    const items = hasMore ? signals.slice(0, query.limit) : signals;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    log.info("admin.moderation.signals.list.success", { count: items.length, total, hasMore });

    return NextResponse.json({
      items,
      nextCursor,
      hasMore,
      total,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Invalid query parameters",
          details: error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    log.error("admin.moderation.signals.list.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch pending signals" },
      { status: 500 }
    );
  }
}
