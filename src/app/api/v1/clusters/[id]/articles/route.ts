import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isAdmin } from "@/lib/auth-guard";
import { regenerateClusterArticles } from "@/lib/ai/agent/analysis-router";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: themeId } = await params;
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/clusters/[id]/articles" });

  try {
    log.info("api.request.start", { method: "GET", path: `/api/v1/clusters/${themeId}/articles` });

    const articles = await prisma.clusterArticle.findMany({
      where: { themeId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            ticker: true,
          },
        },
        theme: {
          select: {
            id: true,
            label: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    log.info("api.request.success", { count: articles.length });

    return NextResponse.json({ items: articles });
  } catch (error) {
    log.error("api.request.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch cluster articles" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: themeId } = await params;
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "POST /api/v1/clusters/[id]/articles" });

  try {
    const session = await auth();
    if (!session?.user || !isAdmin(session)) {
      return NextResponse.json(
        { error: "unauthorized", message: "Admin authentication required" },
        { status: 401 }
      );
    }

    log.info("api.request.start", { method: "POST", path: `/api/v1/clusters/${themeId}/articles` });

    const articles = await regenerateClusterArticles(themeId);

    log.info("api.cluster_articles.regenerated", {
      themeId,
      articlesGenerated: articles.length,
    });

    return NextResponse.json({
      message: "Cluster articles regenerated",
      themeId,
      articlesGenerated: articles.length,
    });
  } catch (error) {
    log.error("api.request.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to regenerate cluster articles" },
      { status: 500 }
    );
  }
}
