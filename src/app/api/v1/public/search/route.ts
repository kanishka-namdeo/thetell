import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({
        signals: [],
        companies: [],
        articles: [],
      });
    }

    const [signals, companies, articles] = await Promise.all([
      prisma.signal.findMany({
        where: {
          status: "ANALYZED",
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { rawContent: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 5,
        include: {
          company: { select: { id: true, name: true } },
        },
        orderBy: { scrapedAt: "desc" },
      }),
      prisma.company.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { ticker: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 5,
        orderBy: { name: "asc" },
      }),
      prisma.article.findMany({
        where: {
          status: "PUBLISHED",
          title: { contains: q, mode: "insensitive" },
        },
        take: 5,
        include: {
          company: { select: { id: true, name: true } },
        },
        orderBy: { publishedAt: "desc" },
      }),
    ]);

    return NextResponse.json({ signals, companies, articles });
  } catch (error) {
    console.error("Public search error:", error);
    return NextResponse.json(
      { error: "internal_error", message: "Search failed" },
      { status: 500 }
    );
  }
}
