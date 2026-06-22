import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "themes" });

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);
    const cursor = searchParams.get("cursor");
    const companyId = searchParams.get("companyId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (companyId) where.companyId = companyId;
    if (status) where.status = status;

    const items = await prisma.signalTheme.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, ticker: true, slug: true } },
        _count: { select: { signals: true, inferences: true } },
      },
      orderBy: { lastUpdated: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > limit;
    const results = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? results[results.length - 1]?.id : null;

    return NextResponse.json({ items: results, nextCursor, hasMore });
  } catch (error) {
    log.error("api.request.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch themes" },
      { status: 500 },
    );
  }
}
