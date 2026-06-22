import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { logAuditEvent } from "@/lib/audit-logger";
import { z } from "zod";

const BulkActionSchema = z.object({
  ids: z.array(z.string()).min(1, "At least one ID is required"),
  reason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "POST /api/v1/admin/moderation/bulk" });

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

    const body = await request.json();
    const parseResult = BulkActionSchema.safeParse(body);

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

    const { ids, reason } = parseResult.data;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "validation_error", message: "Action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    log.info("admin.moderation.bulk.start", { action, count: ids.length });

    const results = { approved: 0, rejected: 0, failed: 0 };

    for (const id of ids) {
      try {
        const signal = await prisma.signal.findUnique({ where: { id } });
        const article = await prisma.article.findUnique({ where: { id } });

        if (signal) {
          if (action === "approve") {
            await prisma.signal.update({
              where: { id },
              data: { status: "ANALYZED" },
            });
            results.approved++;
          } else {
            await prisma.signal.update({
              where: { id },
              data: { status: "REJECTED" },
            });
            results.rejected++;
          }

          await logAuditEvent({
            userId: session.user.id,
            action: `moderation.signal.${action}`,
            resource: "signal",
            resourceId: id,
            details: {
              previousStatus: signal.status,
              newStatus: action === "approve" ? "ANALYZED" : "REJECTED",
              reason,
              bulk: true,
            },
            request,
          });
        } else if (article) {
          if (action === "approve") {
            await prisma.article.update({
              where: { id },
              data: { status: "PUBLISHED", publishedAt: new Date() },
            });
            results.approved++;
          } else {
            await prisma.article.update({
              where: { id },
              data: { status: "DRAFT" },
            });
            results.rejected++;
          }

          await logAuditEvent({
            userId: session.user.id,
            action: `moderation.article.${action}`,
            resource: "article",
            resourceId: id,
            details: {
              previousStatus: article.status,
              newStatus: action === "approve" ? "PUBLISHED" : "DRAFT",
              reason,
              bulk: true,
            },
            request,
          });
        } else {
          results.failed++;
        }
      } catch (err) {
        log.error("admin.moderation.bulk.item.error", { id, error: String(err) });
        results.failed++;
      }
    }

    log.info("admin.moderation.bulk.success", { action, results });

    return NextResponse.json({ success: true, results });
  } catch (error) {
    log.error("admin.moderation.bulk.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to perform bulk action" },
      { status: 500 }
    );
  }
}
