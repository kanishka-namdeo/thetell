import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

const QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
  companyId: z.string().optional(),
  sourceType: z.string().optional(),
  discoveryMethod: z.string().optional(),
  health: z.enum(["healthy", "stale", "failing"]).optional(),
  search: z.string().optional(),
});

function buildHealthFilter(health: "healthy" | "stale" | "failing"): Prisma.CompanyDataSourceWhereInput {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  switch (health) {
    case "healthy":
      return {
        lastCheckedAt: { gte: sevenDaysAgo },
        consecutiveFailures: { lte: 3 },
      };
    case "stale":
      return {
        OR: [
          { lastCheckedAt: { lt: sevenDaysAgo } },
          { lastCheckedAt: null },
        ],
        consecutiveFailures: { lte: 3 },
      };
    case "failing":
      return {
        consecutiveFailures: { gt: 3 },
      };
  }
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/sources" });

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

    log.info("admin.sources.list.start", { query });

    const where: Prisma.CompanyDataSourceWhereInput = {};

    if (query.companyId) {
      where.companyId = query.companyId;
    }

    if (query.sourceType) {
      where.sourceType = query.sourceType as Prisma.EnumSourceTypeFilter;
    }

    if (query.discoveryMethod) {
      where.discoveryMethod = query.discoveryMethod;
    }

    if (query.health) {
      Object.assign(where, buildHealthFilter(query.health));
    }

    if (query.search) {
      where.OR = [
        { url: { contains: query.search, mode: "insensitive" } },
        { company: { name: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    const sources = await prisma.companyDataSource.findMany({
      where,
      take: query.limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      include: {
        company: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const hasMore = sources.length > query.limit;
    const result = hasMore ? sources.slice(0, query.limit) : sources;
    const nextCursor = hasMore ? result[result.length - 1].id : null;

    log.info("admin.sources.list.success", { count: result.length, hasMore });

    return NextResponse.json({
      sources: result,
      nextCursor,
      hasMore,
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

    log.error("admin.sources.list.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch sources" },
      { status: 500 }
    );
  }
}
