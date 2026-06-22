import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { z } from "zod";

const QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
  agentPersona: z.enum(["ANALYST", "GOSSIP_GIRL"]).optional(),
  sortBy: z.enum(["createdAt", "publishedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/moderation/articles" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = QuerySchema.parse(Object.fromEntries(searchParams));

    log.info("admin.moderation.articles.list.start", { query });

    const where: Record<string, unknown> = {
      status: "PENDING_REVIEW",
    };

    if (query.agentPersona) {
      where.agentPersona = query.agentPersona;
    }

    const orderBy: Record<string, string> = {
      [query.sortBy]: query.sortOrder,
    };

    const articles = await prisma.article.findMany({
      where,
      take: query.limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      include: {
        company: true,
        author: {
          select: { name: true, email: true },
        },
      },
      orderBy,
    });

    const total = await prisma.article.count({ where });

    const hasMore = articles.length > query.limit;
    const items = hasMore ? articles.slice(0, query.limit) : articles;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    log.info("admin.moderation.articles.list.success", { count: items.length, total, hasMore });

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

    log.error("admin.moderation.articles.list.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch pending articles" },
      { status: 500 }
    );
  }
}
