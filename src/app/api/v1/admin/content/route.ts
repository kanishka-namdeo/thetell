import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { z } from "zod";

const QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
  type: z.enum(["signal", "article"]).optional(),
  status: z.string().optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "publishedAt"]).default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/content" });

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

    log.info("admin.content.list.start", { query });

    const items: Array<{
      id: string;
      type: "signal" | "article";
      title: string;
      status: string;
      sourceType?: string;
      agentPersona?: string;
      companyName: string;
      createdAt: Date;
      updatedAt: Date;
      publishedAt?: Date | null;
    }> = [];

    const includeSignals = !query.type || query.type === "signal";
    const includeArticles = !query.type || query.type === "article";

    if (includeSignals) {
      const signalWhere: Record<string, unknown> = {};
      if (query.status) {
        signalWhere.status = query.status;
      }

      const signals = await prisma.signal.findMany({
        where: signalWhere,
        take: query.type === "signal" ? query.limit + 1 : undefined,
        cursor: query.type === "signal" && query.cursor ? { id: query.cursor } : undefined,
        include: {
          company: true,
        },
        orderBy: { [query.sortBy]: query.sortOrder },
      });

      items.push(
        ...signals.map((s) => ({
          id: s.id,
          type: "signal" as const,
          title: s.title,
          status: s.status,
          sourceType: s.sourceType,
          companyName: s.company.name,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          publishedAt: null,
        }))
      );
    }

    if (includeArticles) {
      const articleWhere: Record<string, unknown> = {};
      if (query.status) {
        articleWhere.status = query.status;
      }

      const articles = await prisma.article.findMany({
        where: articleWhere,
        take: query.type === "article" ? query.limit + 1 : undefined,
        cursor: query.type === "article" && query.cursor ? { id: query.cursor } : undefined,
        include: {
          company: true,
        },
        orderBy: { [query.sortBy]: query.sortOrder },
      });

      items.push(
        ...articles.map((a) => ({
          id: a.id,
          type: "article" as const,
          title: a.title,
          status: a.status,
          agentPersona: a.agentPersona,
          companyName: a.company.name,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          publishedAt: a.publishedAt,
        }))
      );
    }

    items.sort((a, b) => {
      const dateA = query.sortBy === "publishedAt" ? (a.publishedAt || a.createdAt) : a.createdAt;
      const dateB = query.sortBy === "publishedAt" ? (b.publishedAt || b.createdAt) : b.createdAt;
      const diff = dateB.getTime() - dateA.getTime();
      return query.sortOrder === "asc" ? -diff : diff;
    });

    const limitedItems = items.slice(0, query.limit);
    const hasMore = items.length > query.limit;
    const nextCursor = hasMore ? limitedItems[limitedItems.length - 1].id : null;

    log.info("admin.content.list.success", { count: limitedItems.length, hasMore });

    return NextResponse.json({
      items: limitedItems,
      nextCursor,
      hasMore,
      total: items.length,
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

    log.error("admin.content.list.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch content" },
      { status: 500 }
    );
  }
}
