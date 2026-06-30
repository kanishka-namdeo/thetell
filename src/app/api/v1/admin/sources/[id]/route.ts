import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { logAuditEvent } from "@/lib/audit-logger";
import { z } from "zod";
import { SourceType } from "@prisma/client";

const UpdateSourceSchema = z.object({
  isActive: z.boolean().optional(),
  label: z.string().nullable().optional(),
  sourceType: z.nativeEnum(SourceType).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "PATCH /api/v1/admin/sources/[id]" });

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
    const parseResult = UpdateSourceSchema.safeParse(body);

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

    log.info("admin.source.update.start", { sourceId: id });

    const existing = await prisma.companyDataSource.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "not_found", message: "Source not found" },
        { status: 404 }
      );
    }

    const updateData: {
      isActive?: boolean;
      label?: string | null;
      sourceType?: SourceType;
    } = {};
    if (parseResult.data.isActive !== undefined) {
      updateData.isActive = parseResult.data.isActive;
    }
    if (parseResult.data.label !== undefined) {
      updateData.label = parseResult.data.label;
    }
    if (parseResult.data.sourceType !== undefined) {
      updateData.sourceType = parseResult.data.sourceType as SourceType;
    }

    const updated = await prisma.companyDataSource.update({
      where: { id },
      data: updateData,
      include: {
        company: { select: { id: true, name: true } },
      },
    });

    await logAuditEvent({
      userId: session.user.id,
      action: "content.source.update",
      resource: "company_data_source",
      resourceId: id,
      details: { changes: parseResult.data },
      request,
    });

    log.info("admin.source.update.success", { sourceId: id });

    return NextResponse.json(updated);
  } catch (error) {
    log.error("admin.source.update.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to update source" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = logger.child({ requestId, route: "DELETE /api/v1/admin/sources/[id]" });

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

    log.info("admin.source.delete.start", { sourceId: id });

    const existing = await prisma.companyDataSource.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "not_found", message: "Source not found" },
        { status: 404 }
      );
    }

    await prisma.companyDataSource.delete({
      where: { id },
    });

    await logAuditEvent({
      userId: session.user.id,
      action: "content.source.delete",
      resource: "company_data_source",
      resourceId: id,
      details: { url: existing.url, companyId: existing.companyId },
      request,
    });

    log.info("admin.source.delete.success", { sourceId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("admin.source.delete.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to delete source" },
      { status: 500 }
    );
  }
}
