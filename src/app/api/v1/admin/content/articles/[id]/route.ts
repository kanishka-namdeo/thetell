import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { logAuditEvent } from "@/lib/audit-logger";
import { z } from "zod";

const UpdateArticleSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  body: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "PENDING_REVIEW"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "PATCH /api/v1/admin/content/articles/[id]" });

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
    const body = await request.json();
    const parseResult = UpdateArticleSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Invalid request body",
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    log.info("admin.content.article.update.start", { articleId: id });

    const article = await prisma.article.findUnique({
      where: { id },
    });

    if (!article) {
      return NextResponse.json(
        { error: "not_found", message: "Article not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = { ...parseResult.data };

    if (parseResult.data.status === "PUBLISHED" && article.status !== "PUBLISHED") {
      updateData.publishedAt = new Date();
    }

    if (parseResult.data.status && parseResult.data.status !== "PUBLISHED") {
      updateData.publishedAt = null;
    }

    const updatedArticle = await prisma.article.update({
      where: { id },
      data: updateData,
    });

    await logAuditEvent({
      userId: session.user.id,
      action: "content.article.update",
      resource: "article",
      resourceId: id,
      details: { changes: parseResult.data },
      request,
    });

    log.info("admin.content.article.update.success", { articleId: id });

    return NextResponse.json(updatedArticle);
  } catch (error) {
    log.error("admin.content.article.update.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to update article" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "DELETE /api/v1/admin/content/articles/[id]" });

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

    log.info("admin.content.article.delete.start", { articleId: id });

    const article = await prisma.article.findUnique({
      where: { id },
    });

    if (!article) {
      return NextResponse.json(
        { error: "not_found", message: "Article not found" },
        { status: 404 }
      );
    }

    await prisma.article.delete({
      where: { id },
    });

    await logAuditEvent({
      userId: session.user.id,
      action: "content.article.delete",
      resource: "article",
      resourceId: id,
      details: { title: article.title },
      request,
    });

    log.info("admin.content.article.delete.success", { articleId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("admin.content.article.delete.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to delete article" },
      { status: 500 }
    );
  }
}
