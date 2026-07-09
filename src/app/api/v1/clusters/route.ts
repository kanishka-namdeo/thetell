import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { z } from "zod";

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
  status: z.enum(["EMERGING", "ACCELERATING", "PEAKED", "FADING", "RESOLVED"]).optional(),
  companyId: z.string().optional(),
  q: z.string().optional(),
  sort: z.enum(["momentum", "signalCount", "lastUpdated"]).default("momentum"),
});

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/clusters" });

  try {
    const query = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const { limit, cursor, status, companyId, q, sort } = query;

    log.info("api.request.start", { method: "GET", path: "/api/v1/clusters", ...query });

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (companyId) where.companyId = companyId;
    if (q) {
      where.OR = [
        { label: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    type OrderBy = { [key: string]: unknown };
    const orderBy: OrderBy = (() => {
      if (sort === "signalCount") {
        return { signals: { _count: "desc" as const } };
      }
      if (sort === "lastUpdated") {
        return { lastUpdated: "desc" as const };
      }
      return { momentum: "desc" as const };
    })();

    const clusters = await prisma.signalTheme.findMany({
      where,
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy,
      select: {
        id: true,
        label: true,
        description: true,
        status: true,
        momentum: true,
        companyId: true,
        firstSeen: true,
        lastUpdated: true,
        company: {
          select: { id: true, name: true, ticker: true },
        },
        _count: {
          select: {
            signals: true,
          },
        },
      },
    });

    const hasMore = clusters.length > limit;
    const items = hasMore ? clusters.slice(0, -1) : clusters;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    log.info("api.request.success", { count: items.length, hasMore });

    return NextResponse.json({ items, nextCursor, hasMore });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_error", details: error.flatten() },
        { status: 400 }
      );
    }
    log.error("api.request.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch clusters" },
      { status: 500 }
    );
  }
}
