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
  agentPersona: z.enum(["ANALYST", "GOSSIP_GIRL"]).optional(),
  articleType: z.enum(["per-signal", "cluster"]).optional(),
  sortBy: z.enum(["createdAt", "publishedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/moderation/articles" });

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

    log.info("admin.moderation.articles.list.start", { query });

    const where: Record<string, unknown> = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.agentPersona) {
      where.agentPersona = query.agentPersona;
    }

    const orderBy: Record<string, string> = {
      [query.sortBy]: query.sortOrder,
    };

    const articleType = query.articleType;

    if (articleType === "cluster") {
      const clusterArticles = await prisma.clusterArticle.findMany({
        where,
        take: query.limit + 1,
        cursor: query.cursor ? { id: query.cursor } : undefined,
        include: {
          company: true,
          theme: {
            select: { id: true, label: true, status: true },
          },
        },
        orderBy,
      });

      const total = await prisma.clusterArticle.count({ where });

      const hasMore = clusterArticles.length > query.limit;
      const items = hasMore ? clusterArticles.slice(0, query.limit) : clusterArticles;
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      const formattedItems = items.map((ca) => ({
        id: ca.id,
        title: ca.title,
        slug: ca.slug,
        summary: ca.summary,
        body: ca.body,
        companyId: ca.companyId,
        company: ca.company,
        agentPersona: ca.agentPersona,
        status: ca.status,
        publishedAt: ca.publishedAt,
        createdAt: ca.createdAt,
        updatedAt: ca.updatedAt,
        articleType: "cluster" as const,
        themeId: ca.themeId,
        signalCount: ca.signalCount,
        theme: ca.theme,
      }));

      log.info("admin.moderation.articles.list.success", { count: formattedItems.length, total, hasMore });

      return NextResponse.json({
        items: formattedItems,
        nextCursor,
        hasMore,
        total,
      });
    }

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

    const formattedItems = items.map((a) => ({
      ...a,
      articleType: "per-signal" as const,
    }));

    log.info("admin.moderation.articles.list.success", { count: formattedItems.length, total, hasMore });

    return NextResponse.json({
      items: formattedItems,
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
