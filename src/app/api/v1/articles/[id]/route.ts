import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "GET /api/v1/articles/[id]" });

  try {
    const { id } = await params;

    log.info("api.request.start", { method: "GET", path: `/api/v1/articles/${id}` });

    const article = await prisma.article.findUnique({
      where: { id, status: "PUBLISHED" },
      include: {
        company: true,
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!article) {
      return NextResponse.json(
        { error: "not_found", message: "Article not found" },
        { status: 404 }
      );
    }

    log.info("api.request.success", { articleId: id, agentPersona: article.agentPersona });

    return NextResponse.json(article);
  } catch (error) {
    log.error("api.request.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch article" },
      { status: 500 }
    );
  }
}
