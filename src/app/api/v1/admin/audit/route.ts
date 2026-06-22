import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/audit" });

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

    log.info("admin.audit.list.start", { query });

    const where: Prisma.AuditLogWhereInput = {};

    if (query.action) {
      where.action = query.action;
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
        ...(query.dateTo && { lte: new Date(query.dateTo) }),
      };
    }

    if (query.search) {
      where.OR = [
        { action: { contains: query.search, mode: "insensitive" } },
        { resource: { contains: query.search, mode: "insensitive" } },
        { resourceId: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const auditLogs = await prisma.auditLog.findMany({
      where,
      take: query.limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    const total = await prisma.auditLog.count({ where });

    const hasMore = auditLogs.length > query.limit;
    const items = hasMore ? auditLogs.slice(0, query.limit) : auditLogs;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    log.info("admin.audit.list.success", { count: items.length, total, hasMore });

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

    log.error("admin.audit.list.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch audit logs" },
      { status: 500 }
    );
  }
}
