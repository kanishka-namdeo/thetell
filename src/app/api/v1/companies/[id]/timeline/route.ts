import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().min(1).max(365).default(30),
  limit: z.coerce.number().min(1).max(200).default(50),
});

interface TimelineEntry {
  type: "signal" | "theme" | "inference";
  id: string;
  title: string;
  date: string;
  themeId?: string | null;
  metadata: Record<string, unknown>;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: companyId } = await params;
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/companies/[id]/timeline" });

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const { days, limit } = QuerySchema.parse(rawParams);

    log.info("api.request.start", { method: "GET", path: `/api/v1/companies/${companyId}/timeline`, days, limit });

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json(
        { error: "not_found", message: "Company not found" },
        { status: 404 },
      );
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    const [signals, themes, inferences] = await Promise.all([
      prisma.signal.findMany({
        where: { companyId, status: "ANALYZED", scrapedAt: { gte: since } },
        select: {
          id: true,
          title: true,
          sourceType: true,
          scrapedAt: true,
          themes: { select: { id: true, label: true } },
        },
        orderBy: { scrapedAt: "desc" },
      }),
      prisma.signalTheme.findMany({
        where: { companyId, lastUpdated: { gte: since } },
        select: {
          id: true,
          label: true,
          description: true,
          status: true,
          momentum: true,
          lastUpdated: true,
        },
        orderBy: { lastUpdated: "desc" },
      }),
      prisma.inference.findMany({
        where: { companyId, createdAt: { gte: since } },
        select: {
          id: true,
          title: true,
          hypothesis: true,
          confidence: true,
          status: true,
          themeId: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const entries: TimelineEntry[] = [];

    for (const s of signals) {
      entries.push({
        type: "signal",
        id: s.id,
        title: s.title,
        date: s.scrapedAt.toISOString(),
        themeId: s.themes[0]?.id ?? null,
        metadata: {
          sourceType: s.sourceType,
          themes: s.themes.map((t) => ({ id: t.id, label: t.label })),
        },
      });
    }

    for (const t of themes) {
      entries.push({
        type: "theme",
        id: t.id,
        title: t.label,
        date: t.lastUpdated.toISOString(),
        themeId: t.id,
        metadata: {
          description: t.description,
          status: t.status,
          momentum: t.momentum,
        },
      });
    }

    for (const inf of inferences) {
      entries.push({
        type: "inference",
        id: inf.id,
        title: inf.title,
        date: inf.createdAt.toISOString(),
        themeId: inf.themeId,
        metadata: {
          hypothesis: inf.hypothesis,
          confidence: inf.confidence,
          status: inf.status,
        },
      });
    }

    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const hasMore = entries.length > limit;
    const items = hasMore ? entries.slice(0, limit) : entries;

    const groupedByTheme = new Map<string, TimelineEntry[]>();
    for (const entry of items) {
      if (entry.themeId) {
        const existing = groupedByTheme.get(entry.themeId) ?? [];
        existing.push(entry);
        groupedByTheme.set(entry.themeId, existing);
      }
    }

    log.info("api.request.success", {
      companyId,
      totalEntries: entries.length,
      returned: items.length,
    });

    return NextResponse.json({
      items,
      hasMore,
      groupedByTheme: Object.fromEntries(groupedByTheme),
      summary: {
        signals: signals.length,
        themes: themes.length,
        inferences: inferences.length,
        days,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_error", message: "Invalid query parameters", details: error.flatten() },
        { status: 400 },
      );
    }
    log.error("api.request.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch timeline" },
      { status: 500 },
    );
  }
}
