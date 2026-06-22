import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { logAuditEvent } from "@/lib/audit-logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "POST /api/v1/admin/moderation/articles/[id]/approve" });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    log.info("admin.moderation.article.approve.start", { articleId: id });

    const article = await prisma.article.findUnique({
      where: { id },
    });

    if (!article) {
      return NextResponse.json(
        { error: "not_found", message: "Article not found" },
        { status: 404 }
      );
    }

    const updatedArticle = await prisma.article.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    await logAuditEvent({
      userId: session.user.id,
      action: "moderation.article.approve",
      resource: "article",
      resourceId: id,
      details: { previousStatus: article.status, newStatus: "PUBLISHED" },
      request,
    });

    log.info("admin.moderation.article.approve.success", { articleId: id });

    return NextResponse.json(updatedArticle);
  } catch (error) {
    log.error("admin.moderation.article.approve.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to approve article" },
      { status: 500 }
    );
  }
}
