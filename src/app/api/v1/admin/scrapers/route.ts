import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { getAllScrapers } from "@/lib/scraping/registry";
import { prisma } from "@/lib/db";

export async function GET() {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/admin/scrapers" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    log.info("admin.scrapers.list.start");

    const allScrapers = getAllScrapers();

    // Group signals by scraperName to get counts
    const signalCounts = await prisma.signal.groupBy({
      by: ["scraperName"],
      _count: { id: true },
    });
    const countMap = new Map<string, number>();
    for (const sc of signalCounts) {
      if (sc.scraperName) {
        countMap.set(sc.scraperName, sc._count.id);
      }
    }

    const scrapers = allScrapers.map((entry) => {
      const name = entry.scraper.constructor.name.replace("Scraper", "");
      const kebabName = name.replace(/([A-Z])/g, (m, c: string, i: number) => (i > 0 ? "-" : "") + c.toLowerCase());
      return {
        name,
        displayName: name.replace(/([A-Z])/g, " $1").trim(),
        enabled: entry.enabled,
        rateLimitPerMinute: 60,
        retryAttempts: 3,
        timeout: 30,
        lastRunAt: null,
        lastSuccessAt: null,
        successRate: entry.enabled ? 100 : 0,
        errorCount: 0,
        signalCount: countMap.get(kebabName) ?? countMap.get(name.toLowerCase()) ?? 0,
      };
    });

    log.info("admin.scrapers.list.success", { count: scrapers.length });

    return NextResponse.json({ scrapers });
  } catch (error) {
    log.error("admin.scrapers.list.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch scrapers" },
      { status: 500 }
    );
  }
}
