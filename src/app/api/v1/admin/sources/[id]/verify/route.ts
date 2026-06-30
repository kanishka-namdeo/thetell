import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { logAuditEvent } from "@/lib/audit-logger";
import { verifySourceUrl } from "@/lib/sources/verifier";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "POST /api/v1/admin/sources/[id]/verify" });

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

    log.info("admin.source.verify.start", { sourceId: id });

    const existing = await prisma.companyDataSource.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "not_found", message: "Source not found" },
        { status: 404 }
      );
    }

    const verification = await verifySourceUrl(existing.url);

    const now = new Date();
    const updateData = {
      lastCheckedAt: now,
      httpStatusCode: verification.statusCode ?? null,
      failureReason: verification.error ?? null,
      ...(verification.reachable
        ? {
            lastSuccessAt: now,
            consecutiveFailures: 0,
          }
        : {
            consecutiveFailures: { increment: 1 },
          }),
    };

    const updated = await prisma.companyDataSource.update({
      where: { id },
      data: updateData,
      include: {
        company: { select: { id: true, name: true } },
      },
    });

    await logAuditEvent({
      userId: session.user.id,
      action: "content.source.verify",
      resource: "company_data_source",
      resourceId: id,
      details: {
        url: existing.url,
        reachable: verification.reachable,
        statusCode: verification.statusCode,
      },
      request,
    });

    log.info("admin.source.verify.success", {
      sourceId: id,
      reachable: verification.reachable,
    });

    return NextResponse.json({
      success: true,
      source: updated,
      verification,
    });
  } catch (error) {
    log.error("admin.source.verify.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to verify source" },
      { status: 500 }
    );
  }
}
