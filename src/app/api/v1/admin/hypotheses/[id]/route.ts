import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth-guard";
import { z } from "zod";

const UpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED", "CONFIRMED", "REFUTED"]).optional(),
  priority: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const { id } = await params;
  const log = logger.child({ requestId, route: `PATCH /api/v1/admin/hypotheses/${id}` });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = UpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "Invalid update data",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    log.info("admin.hypotheses.update.start", { hypothesisId: id });

    const existing = await prisma.companyHypothesis.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "not_found", message: "Hypothesis not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.confidence !== undefined) updateData.confidence = parsed.data.confidence;
    else if (parsed.data.priority !== undefined) updateData.confidence = parsed.data.priority;

    const hypothesis = await prisma.companyHypothesis.update({
      where: { id },
      data: updateData,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    log.info("admin.hypotheses.update.success", { hypothesisId: id });

    return NextResponse.json({ data: hypothesis });
  } catch (error) {
    log.error("admin.hypotheses.update.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to update hypothesis" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const { id } = await params;
  const log = logger.child({ requestId, route: `DELETE /api/v1/admin/hypotheses/${id}` });

  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    log.info("admin.hypotheses.delete.start", { hypothesisId: id });

    const existing = await prisma.companyHypothesis.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "not_found", message: "Hypothesis not found" },
        { status: 404 }
      );
    }

    await prisma.companyHypothesis.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });

    log.info("admin.hypotheses.delete.success", { hypothesisId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("admin.hypotheses.delete.error", { error: String(error) });
    return NextResponse.json(
      { error: "internal_error", message: "Failed to delete hypothesis" },
      { status: 500 }
    );
  }
}
